function parseCsvSimple(raw) {
    const lines = String(raw || '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return { columnNames: [], rows: [] };
    const columnNames = lines[0].split(',').map((c) => c.trim());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const obj = {};
      columnNames.forEach((col, i) => {
        obj[col] = values[i] ?? '';
      });
      return obj;
    });
    return { columnNames, rows };
  }

  module.exports = {
    parseCsvSimple
  }