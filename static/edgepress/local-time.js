for (const element of document.querySelectorAll('time[data-local-time]')) {
  const value = new Date(element.dateTime);
  if (!Number.isFinite(value.valueOf())) continue;
  try {
    const options = element.dataset.dateOnly === 'true'
      ? {dateStyle: 'long', timeZone: 'UTC'}
      : {year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short'};
    const locale = element.dataset.timeLocale || document.documentElement.lang || undefined;
    element.textContent = new Intl.DateTimeFormat(locale, options).format(value);
    element.title = element.dataset.dateOnly === 'true' ? element.dateTime.slice(0,10) : value.toISOString();
  } catch {}
}
