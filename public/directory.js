const search = document.querySelector('#record-search');
const results = document.querySelector('#record-results');
const rows = Array.from(document.querySelectorAll('#record-table tbody tr'), row => ({
  row,
  text: Array.from(row.cells, cell => (cell.querySelector('.record-name') || cell).textContent.trim()).join(' ').toLocaleLowerCase()
}));

function filterRecords() {
  const query = search.value.trim().toLocaleLowerCase();
  let matching = 0;
  for (const { row, text } of rows) {
    row.hidden = !text.includes(query);
    if (!row.hidden) matching++;
  }
  results.textContent = query ? matching + ' of ' + rows.length + ' records' : '';
}

search.closest('.directory-toolbar').hidden = false;
search.addEventListener('input', filterRecords);
filterRecords();
