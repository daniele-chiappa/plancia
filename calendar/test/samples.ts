// Calendars the tests share: lessons is the one of gosidian's Go tests.

export const lessons = `calendar: 1
timezone: Europe/Rome
events:
  - title: Lezione
    id: lez
    date: 2026-11-23
    time: 18:00-19:30
    repeat: {every: 2 weeks, on: [mon, thu], until: 2027-02-28}
    skip: [2026-12-10]
    pause:
      - {from: 2026-12-21, to: 2027-01-06}
    changes:
      - {date: 2027-01-18, time: 19:00-20:30}
      - {date: 2027-01-21, move: 2027-01-22, place: Aula 2}
      - {date: 2027-02-01, cancel: true}
    place: Sala grande
`
