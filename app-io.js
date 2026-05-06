/* ============================================
   IMPORT / EXPORT MODULE
   ============================================ */

function importExcel(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false, cellFormula: false });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

            // Find employees (rows with initials and percentages like "MSP", "=15/30")
            const employees = [];
            for (let r = 0; r < Math.min(raw.length, 25); r++) {
                const row = raw[r];
                if (row && row[0] && row[1] && typeof row[0] === 'string' && String(row[1]).includes('/')) {
                    employees.push(String(row[0]).trim());
                }
            }
            if (employees.length > 0) {
                AppState.employees = employees;
            }

            // Find shift label rows
            let dateRow = -1, shiftRows = {};
            for (let r = 0; r < raw.length; r++) {
                const row = raw[r];
                if (!row) continue;
                for (let c = 0; c < Math.min(row.length, 10); c++) {
                    const v = row[c];
                    if (typeof v === 'string') {
                        const trimmed = v.trim();
                        if (trimmed === '8h-17h' && !shiftRows['8h-17h']) {
                            shiftRows['8h-17h'] = r;
                            dateRow = r - 1;
                        }
                        if (trimmed === '12h-21h' && !shiftRows['12h-21h']) shiftRows['12h-21h'] = r;
                        if (trimmed === '16h-01h' && !shiftRows['16h-01h']) shiftRows['16h-01h'] = r;
                    }
                }
            }

            if (dateRow < 0) {
                toast('Não foi possível encontrar as datas no ficheiro.', 'error');
                return;
            }

            // Parse dates
            const datesRow = raw[dateRow];
            const firstDateCol = (() => {
                for (let c = 1; c < datesRow.length; c++) {
                    const d = parseDate(datesRow[c]);
                    if (d && !isNaN(d.getTime())) return c;
                }
                return 5;
            })();

            AppState.dates = [];
            AppState.calendar = {};
            AppState.nightDates = new Set();

            for (let c = firstDateCol; c < datesRow.length; c++) {
                const d = parseDate(datesRow[c]);
                if (!d || isNaN(d.getTime())) continue;
                const dk = dateKey(d);
                AppState.dates.push(dk);

                const cal = {};
                if (shiftRows['8h-17h'] !== undefined) {
                    const row8 = raw[shiftRows['8h-17h']];
                    cal['8h-17h'] = parsePeople(row8 ? row8[c] : null);
                }
                if (shiftRows['12h-21h'] !== undefined) {
                    const row12 = raw[shiftRows['12h-21h']];
                    cal['12h-21h'] = parsePeople(row12 ? row12[c] : null);
                }
                if (shiftRows['16h-01h'] !== undefined) {
                    const row16 = raw[shiftRows['16h-01h']];
                    const people = parsePeople(row16 ? row16[c] : null);
                    cal['16h-01h'] = people;
                    if (people.length > 0) AppState.nightDates.add(dk);
                }
                AppState.calendar[dk] = cal;
            }

            AppState.includeNight = shiftRows['16h-01h'] !== undefined;

            // Update UI
            document.getElementById('numEmployees').value = AppState.employees.length;
            renderEmployeeInputs();
            AppState.employees.forEach((name, i) => {
                const inp = document.getElementById(`empName${i}`);
                if (inp) inp.value = name;
            });

            showImportStatus(`✅ Importado: ${AppState.dates.length} datas, ${AppState.employees.length} funcionários.`, 'success');
            toast('Ficheiro importado com sucesso!', 'success');
            renderCalendar();
            renderStats();
            renderExportPreview();
        } catch (err) {
            console.error(err);
            showImportStatus('Erro ao ler o ficheiro: ' + err.message, 'error');
            toast('Erro ao importar ficheiro.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function showImportStatus(msg, type) {
    const el = document.getElementById('importStatus');
    el.textContent = msg;
    el.className = `import-status ${type}`;
    el.classList.remove('hidden');
}

function exportExcel() {
    if (AppState.dates.length === 0) {
        toast('Não existem datas para exportar.', 'error');
        return;
    }

    const stats = computeStats();
    const shifts = ['8h-17h', '12h-21h'];
    if (AppState.includeNight) shifts.push('16h-01h');
    const numDates = AppState.dates.length;

    // Build the data array to match the original Excel format exactly
    // Rows 1-13: empty (spacing for visual layout)
    const data = [];
    for (let i = 0; i < 13; i++) data.push([]);

    // Row 14 (index 13): Title — merged A14:D14
    const titleRow = new Array(5 + numDates).fill(null);
    // Find the last date to generate the title
    const lastDateParts = AppState.dates[AppState.dates.length - 1].split('-');
    const lastDate = new Date(+lastDateParts[0], +lastDateParts[1] - 1, +lastDateParts[2]);
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    titleRow[0] = `Até dia ${lastDate.getDate()}/${monthNames[lastDate.getMonth()]}`;
    data.push(titleRow);

    // Row 15 (index 14): empty
    data.push([]);

    // Row 16 (index 15): Stats header
    const statsHeader = new Array(5 + numDates).fill(null);
    statsHeader[1] = '% 8-17H';
    statsHeader[2] = '% 12-21H';
    if (AppState.includeNight) statsHeader[3] = '% 16-01H';
    data.push(statsHeader);

    // Rows 17-20 (or more): Employee stats
    AppState.employees.forEach(emp => {
        const s = stats[emp] || { '8h-17h': 0, '12h-21h': 0, '16h-01h': 0, total: 0, daysWorked: 0 };
        const row = new Array(5 + numDates).fill(null);
        row[0] = emp;
        row[1] = s.total > 0 ? `${s['8h-17h']}/${s.total}` : '0/0';
        row[2] = s.total > 0 ? `${s['12h-21h']}/${s.total}` : '0/0';
        if (AppState.includeNight) {
            row[3] = s.total > 0 ? `${s['16h-01h']}/${s.total}` : '0/0';
        }
        row[4] = `${s.daysWorked}/${numDates}`;
        data.push(row);
    });

    // Counter row (day numbers)
    const counterRow = new Array(5 + numDates).fill(null);
    for (let i = 0; i < numDates; i++) counterRow[5 + i] = i + 1;
    data.push(counterRow);

    // Range + Dates row
    const datesRow = new Array(5 + numDates).fill(null);
    datesRow[0] = 'Range:';
    datesRow[1] = `Auto`;
    AppState.dates.forEach((dk, i) => {
        const parts = dk.split('-');
        datesRow[5 + i] = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    });
    data.push(datesRow);

    // Shift rows: 8h-17h, 12h-21h, 16h-01h
    shifts.forEach(shift => {
        const row = new Array(5 + numDates).fill(null);
        row[4] = shift;
        AppState.dates.forEach((dk, i) => {
            const cal = AppState.calendar[dk];
            if (!cal || !cal[shift] || cal[shift].length === 0) {
                row[5 + i] = shift === '16h-01h' ? '-' : '';
            } else {
                row[5 + i] = cal[shift].join(' + ');
            }
        });
        data.push(row);
    });

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Merge title cell A14:D14
    ws['!merges'] = [{ s: { r: 13, c: 0 }, e: { r: 13, c: 3 } }];

    // Set column widths
    ws['!cols'] = [
        { wch: 18 }, // A - names
        { wch: 10 }, // B - % 8h
        { wch: 10 }, // C - % 12h
        { wch: 10 }, // D - % 16h
        { wch: 8 },  // E - shift label
    ];
    for (let i = 0; i < numDates; i++) {
        ws['!cols'].push({ wch: 14 });
    }

    // Format date cells in the dates row
    const datesRowIdx = data.length - shifts.length - 1;
    for (let c = 5; c < 5 + numDates; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: datesRowIdx, c: c });
        if (ws[cellRef] && ws[cellRef].v instanceof Date) {
            ws[cellRef].t = 'd';
            ws[cellRef].z = 'DD/MM/YYYY';
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, 'Planeamento_PRMS_Core.xlsx');
    toast('Ficheiro exportado com sucesso!', 'success');
}
