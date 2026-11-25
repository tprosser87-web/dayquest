/* Minimal ICS (iCalendar) parser with timezone + common RRULE support. */
(function (global) {
  'use strict';
  var WIN_TZ = {
    'Eastern Standard Time': 'America/New_York', 'US Eastern Standard Time': 'America/Indiana/Indianapolis',
    'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
    'US Mountain Standard Time': 'America/Phoenix', 'Pacific Standard Time': 'America/Los_Angeles',
    'Alaskan Standard Time': 'America/Anchorage', 'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Atlantic Standard Time': 'America/Halifax', 'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik', 'W. Europe Standard Time': 'Europe/Berlin',
    'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
    'Central European Standard Time': 'Europe/Warsaw', 'E. Europe Standard Time': 'Europe/Chisinau',
    'FLE Standard Time': 'Europe/Kiev', 'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai',
    'Tokyo Standard Time': 'Asia/Tokyo', 'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC',
    'Coordinated Universal Time': 'UTC'
  };
  var DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function resolveTz(tzid) {
    if (!tzid) return null;
    tzid = tzid.replace(/^"|"$/g, '');
    if (WIN_TZ[tzid]) return WIN_TZ[tzid];
    try { new Intl.DateTimeFormat('en-US', { timeZone: tzid }); return tzid; } catch (e) {}
    var m = tzid.match(/([A-Za-z]+\/[A-Za-z_]+)/);
    if (m) { try { new Intl.DateTimeFormat('en-US', { timeZone: m[1] }); return m[1]; } catch (e) {} }
    return null;
  }
  var dtfCache = {};
  function tzOffsetMs(tz, utcMs) {
    var f = dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    var p = {}; f.formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - utcMs;
  }
  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    var guess = Date.UTC(y, mo, d, h, mi, s);
    var off = tzOffsetMs(tz, guess);
    var t = guess - off;
    var off2 = tzOffsetMs(tz, t);
    if (off2 !== off) t = guess - off2;
    return t;
  }
  function parseDate(value, params) {
    params = params || {};
    var m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (!m[4] || params.VALUE === 'DATE') return { allDay: true, y: y, mo: mo, d: d, ms: new Date(y, mo, d).getTime() };
    var h = +m[4], mi = +m[5], s = +(m[6] || 0);
    var ms;
    if (m[7]) ms = Date.UTC(y, mo, d, h, mi, s);
    else {
      var tz = resolveTz(params.TZID);
      ms = tz ? zonedToUtc(y, mo, d, h, mi, s, tz) : new Date(y, mo, d, h, mi, s).getTime();
    }
    return { allDay: false, ms: ms };
  }
  function unescapeText(s) {
    return (s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  }
  function parseDuration(s) {
    var m = (s || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return 0;
    var ms = (((+(m[2] || 0) * 7 + +(m[3] || 0)) * 24 + +(m[4] || 0)) * 60 + +(m[5] || 0)) * 60000 + +(m[6] || 0) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  function parse(text) {
    var lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    var events = [], cur = null, depth = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; depth = 0; continue; }
      if (!cur) continue;
      if (/^BEGIN:/.test(line)) { depth++; continue; }
      if (/^END:/.test(line) && line !== 'END:VEVENT') { depth--; continue; }
      if (line === 'END:VEVENT') { if (cur.start) events.push(finish(cur)); cur = null; continue; }
      if (depth > 0) continue;
      var c = line.indexOf(':'); if (c < 0) continue;
      var head = line.slice(0, c), val = line.slice(c + 1);
      var parts = head.split(';'), name = parts[0].toUpperCase(), params = {};
      for (var k = 1; k < parts.length; k++) { var e = parts[k].indexOf('='); if (e > 0) params[parts[k].slice(0, e).toUpperCase()] = parts[k].slice(e + 1); }
      switch (name) {
        case 'SUMMARY': cur.title = unescapeText(val); break;
        case 'LOCATION': cur.location = unescapeText(val); break;
        case 'UID': cur.uid = val; break;
        case 'DTSTART': cur.start = parseDate(val, params); break;
        case 'DTEND': cur.end = parseDate(val, params); break;
        case 'DURATION': cur.duration = parseDuration(val); break;
        case 'RRULE': cur.rrule = val; break;
        case 'STATUS': cur.status = val.toUpperCase(); break;
        case 'TRANSP': cur.transp = val; break;
        case 'RECURRENCE-ID': cur.recurrenceId = parseDate(val, params); break;
        case 'EXDATE': val.split(',').forEach(function (v) { var dd = parseDate(v, params); if (dd) cur.exdates.push(dd.ms); }); break;
      }
    }
    return events;
  }
  function finish(ev) {
    ev.allDay = ev.start.allDay;
    var dur;
    if (ev.end) dur = ev.end.ms - ev.start.ms;
    else if (ev.duration) dur = ev.duration;
    else dur = ev.allDay ? 86400000 : 0;
    ev.durMs = dur;
    ev.title = ev.title || '(No title)';
    return ev;
  }
  function parseRule(s) {
    var r = {}; s.split(';').forEach(function (p) { var kv = p.split('='); r[kv[0].toUpperCase()] = kv[1]; });
    return r;
  }
  // Return occurrences [{title,location,start,end,allDay}] that overlap [rangeStart, rangeEnd)
  function occurrences(events, rangeStart, rangeEnd) {
    var out = [], overrides = {};
    events.forEach(function (ev) { if (ev.recurrenceId && ev.uid) overrides[ev.uid + '|' + ev.recurrenceId.ms] = true; });
    events.forEach(function (ev) {
      if (ev.status === 'CANCELLED') return;
      var push = function (startMs) {
        var endMs = startMs + Math.max(ev.durMs, 0);
        var overlaps = ev.durMs > 0 ? (startMs < rangeEnd && endMs > rangeStart) : (startMs >= rangeStart && startMs < rangeEnd);
        if (overlaps) out.push({ title: ev.title, location: ev.location, start: startMs, end: endMs, allDay: ev.allDay });
      };
      if (!ev.rrule || ev.recurrenceId) { push(ev.start.ms); return; }
      var r = parseRule(ev.rrule), freq = r.FREQ, interval = +(r.INTERVAL || 1);
      var count = r.COUNT ? +r.COUNT : Infinity;
      var until = r.UNTIL ? parseDate(r.UNTIL, {}).ms + (r.UNTIL.length === 8 ? 86399999 : 0) : Infinity;
      var byday = r.BYDAY ? r.BYDAY.split(',') : null;
      var bymonthday = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
      var s0 = new Date(ev.start.ms);
      var hh = s0.getHours(), mm = s0.getMinutes();
      var n = 0, guard = 0;
      var excluded = function (ms) {
        if (ev.exdates.indexOf(ms) >= 0) return true;
        if (ev.uid && overrides[ev.uid + '|' + ms]) return true;
        return false;
      };
      var emit = function (ms) {
        if (ms < ev.start.ms) return true;
        if (ms > until || n >= count) return false;
        n++;
        if (!excluded(ms)) push(ms);
        return ms < rangeEnd;
      };
      var mk = function (y, mo, d) {
        if (ev.allDay) return new Date(y, mo, d).getTime();
        var base = new Date(y, mo, d, hh, mm);
        return base.getTime();
      };
      var tzStart = ev.start; // occurrence wall time kept in local tz (good enough for same-tz users)
      var y = s0.getFullYear(), mo = s0.getMonth(), d = s0.getDate();
      if (freq === 'DAILY') {
        for (var t = 0; guard++ < 5000; t += interval) { var ms = mk(y, mo, d + t); if (!emit(ms)) break; }
      } else if (freq === 'WEEKLY') {
        var days = byday ? byday.map(function (x) { return DAYS[x.slice(-2)]; }).sort() : [s0.getDay()];
        var weekStart = new Date(y, mo, d - s0.getDay());
        outer: for (var w = 0; guard++ < 3000; w += interval) {
          for (var j = 0; j < days.length; j++) {
            var ms2 = mk(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + w * 7 + days[j]);
            if (!emit(ms2)) break outer;
          }
        }
      } else if (freq === 'MONTHLY') {
        for (var mth = 0; guard++ < 1200; mth += interval) {
          var cy = y, cm = mo + mth, cands = [];
          if (byday) {
            byday.forEach(function (b) {
              var mt = b.match(/^([+-]?\d+)?([A-Z]{2})$/); if (!mt) return;
              var wd = DAYS[mt[2]], nth = mt[1] ? +mt[1] : 0;
              var first = new Date(cy, cm, 1), last = new Date(cy, cm + 1, 0).getDate(), list = [];
              for (var dd = 1; dd <= last; dd++) if (new Date(cy, cm, dd).getDay() === wd) list.push(dd);
              if (nth > 0 && list[nth - 1]) cands.push(list[nth - 1]);
              else if (nth < 0 && list[list.length + nth]) cands.push(list[list.length + nth]);
              else if (!nth) cands = cands.concat(list);
              void first;
            });
          } else {
            var lastD = new Date(cy, cm + 1, 0).getDate();
            (bymonthday || [d]).forEach(function (md) { var v = md < 0 ? lastD + md + 1 : md; if (v <= lastD) cands.push(v); });
          }
          cands.sort(function (a, b) { return a - b; });
          var stop = false;
          for (var q = 0; q < cands.length; q++) { if (!emit(mk(cy, cm, cands[q]))) { stop = true; break; } }
          if (stop) break;
        }
      } else if (freq === 'YEARLY') {
        for (var yr = 0; guard++ < 200; yr += interval) {
          var dt = new Date(y + yr, mo, d);
          if (dt.getMonth() !== mo) continue;
          if (!emit(mk(y + yr, mo, d))) break;
        }
      } else { push(ev.start.ms); }
      void tzStart;
    });
    out.sort(function (a, b) { return (b.allDay - a.allDay) || a.start - b.start; });
    return out;
  }
  global.ICS = { parse: parse, occurrences: occurrences };
})(typeof window !== 'undefined' ? window : globalThis);
