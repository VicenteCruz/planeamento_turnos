/* ============================================
   UI RENDERING MODULE
   ============================================ */

function renderEmployeeInputs() {
    const n = parseInt(document.getElementById('numEmployees').value) || 4;
    const list = document.getElementById('employeeNamesList');
    list.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const div = document.createElement('div');
        div.className = 'employee-name-input';
        div.innerHTML = `<span>${i + 1}.</span><input id="empName${i}" type="text" value="${AppState.employees[i] || ''}" placeholder="Nome/Iniciais">`;
        list.appendChild(div);
    }
}

function renderCalendar() {
    const table = document.getElementById('calendarTable');
    if (AppState.dates.length === 0) {
        table.innerHTML = '<tbody><tr><td style="padding:40px;color:var(--text-muted);text-align:center;">Nenhuma data carregada. Importa um ficheiro ou adiciona datas.</td></tr></tbody>';
        return;
    }

    const shifts = ['8h-17h', '12h-21h', '16h-01h'];

    let html = '<thead><tr><th></th>';
    AppState.dates.forEach(dk => {
        const parts = dk.split('-');
        const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        const dayName = getDayName(d);
        const wknd = isWeekend(d) ? ' weekend-col' : '';
        html += `<th class="date-header${wknd}" style="position: relative; min-width: 100px; padding-top: 24px;">
            <button class="single-day-autofill-btn" data-date="${dk}" style="position: absolute; top: 4px; right: 4px; padding: 0; font-size: 0.85rem; background: none; border: none; box-shadow: none; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Auto-Preencher este dia">✨</button>
            <div style="white-space: nowrap; font-size: 0.9rem; margin-bottom: 4px;">${formatDate(d)} ${dayName}</div>
        </th>`;
    });
    html += '</tr></thead><tbody>';

    shifts.forEach(shift => {
        html += '<tr>';
        const badgeClass = shift === '8h-17h' ? 'morning' : shift === '12h-21h' ? 'afternoon' : 'night';
        html += `<td class="shift-label"><span class="shift-badge shift-${badgeClass}" style="font-size:0.7rem;padding:2px 8px;">${shift}</span></td>`;

        AppState.dates.forEach(dk => {
            const cal = AppState.calendar[dk] || {};
            const people = cal[shift] || [];
            const isNight = shift === '16h-01h';
            const hasNight = AppState.nightDates.has(dk);
            const parts = dk.split('-');
            const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
            const wknd = isWeekend(d) ? ' weekend-col' : '';
            const nightClass = isNight ? ' cell-night' : '';

            if (isNight && !hasNight) {
                html += `<td class="cell-editable cell-disabled${wknd}" data-date="${dk}" data-shift="${shift}">Desativado</td>`;
            } else {
                const display = people.length > 0 ? people.join(' + ') : '';
                const filledClass = people.length > 0 ? 'cell-filled' : 'cell-empty';
                const baseClass = isNight ? ' cell-night' : '';
                html += `<td class="cell-editable ${filledClass}${baseClass}${wknd}" data-date="${dk}" data-shift="${shift}">${display || '—'}</td>`;
            }
        });
        html += '</tr>';
    });

    html += '</tbody>';
    table.innerHTML = html;

    // Attach click handlers
    table.querySelectorAll('.cell-editable').forEach(td => {
        td.addEventListener('click', () => openCellEditor(td.dataset.date, td.dataset.shift));
    });

    table.querySelectorAll('.single-day-autofill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent other click events
            openSingleDayAutoFill(btn.dataset.date);
        });
    });
}

function openCellEditor(dk, shift) {
    const modal = document.getElementById('cellEditModal');
    const title = document.getElementById('cellEditTitle');
    const checkboxes = document.getElementById('cellEditCheckboxes');

    const parts = dk.split('-');
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    title.textContent = `${shift} — ${formatDate(d)} (${getDayName(d)})`;

    const cal = AppState.calendar[dk] || {};
    const current = cal[shift] || [];

    checkboxes.innerHTML = '';
    AppState.employees.forEach(emp => {
        const label = document.createElement('label');
        const checked = current.includes(emp) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${emp}" ${checked}> ${emp}`;
        checkboxes.appendChild(label);
    });

    const toggleGroup = document.getElementById('cellEditToggleGroup');
    const toggleInput = document.getElementById('cellEditActiveToggle');
    const peopleGroup = document.getElementById('cellEditPeopleGroup');

    if (shift === '16h-01h') {
        toggleGroup.style.display = 'block';
        toggleInput.checked = AppState.nightDates.has(dk);
        toggleInput.onchange = () => {
            peopleGroup.style.display = toggleInput.checked ? 'block' : 'none';
        };
        toggleInput.onchange(); // trigger initial visibility
    } else {
        toggleGroup.style.display = 'none';
        peopleGroup.style.display = 'block';
    }

    modal.classList.remove('hidden');
    modal._dk = dk;
    modal._shift = shift;
}

function renderStats() {
    const stats = computeStats();
    const pairs = computePairs();
    const grid = document.getElementById('statsGrid');
    const totalDates = AppState.dates.length;

    let html = '';
    AppState.employees.forEach(emp => {
        const s = stats[emp];
        const pct8 = s.total > 0 ? (s['8h-17h'] / s.total * 100) : 0;
        const pct12 = s.total > 0 ? (s['12h-21h'] / s.total * 100) : 0;
        const pct16 = s.total > 0 ? (s['16h-01h'] / s.total * 100) : 0;

        html += `<div class="stat-card">
            <div class="stat-card-header">
                <span class="stat-name">${emp}</span>
                <span class="stat-total">${s.daysWorked}/${totalDates} dias</span>
            </div>
            <div class="stat-bar-group">
                <div class="stat-bar-label"><span>8h-17h</span><span>${s['8h-17h']} (${pct8.toFixed(0)}%)</span></div>
                <div class="stat-bar-track"><div class="stat-bar-fill morning" style="width:${pct8}%"></div></div>
            </div>
            <div class="stat-bar-group">
                <div class="stat-bar-label"><span>12h-21h</span><span>${s['12h-21h']} (${pct12.toFixed(0)}%)</span></div>
                <div class="stat-bar-track"><div class="stat-bar-fill afternoon" style="width:${pct12}%"></div></div>
            </div>`;
        if (AppState.includeNight) {
            html += `<div class="stat-bar-group">
                <div class="stat-bar-label"><span>16h-01h</span><span>${s['16h-01h']} (${pct16.toFixed(0)}%)</span></div>
                <div class="stat-bar-track"><div class="stat-bar-fill night" style="width:${pct16}%"></div></div>
            </div>`;
        }
        html += '</div>';
    });
    grid.innerHTML = html;

    // Pairs matrix
    const pairsDiv = document.getElementById('pairsMatrix');
    const emps = AppState.employees;
    let pHtml = '<table class="pairs-matrix"><thead><tr><th></th>';
    emps.forEach(e => pHtml += `<th>${e}</th>`);
    pHtml += '</tr></thead><tbody>';

    // Find max pair count for color grading
    const pairValues = Object.values(pairs);
    const maxPair = Math.max(...pairValues, 1);
    const avgPair = pairValues.length > 0 ? pairValues.reduce((a, b) => a + b, 0) / pairValues.length : 0;

    emps.forEach((a, i) => {
        pHtml += `<tr><th>${a}</th>`;
        emps.forEach((b, j) => {
            if (i === j) {
                pHtml += '<td>—</td>';
            } else {
                const key = pairKey(a, b);
                const count = pairs[key] || 0;
                let cls = 'pair-medium';
                if (count >= avgPair * 1.3) cls = 'pair-high';
                else if (count <= avgPair * 0.7) cls = 'pair-low';
                pHtml += `<td class="pair-count ${cls}">${count}</td>`;
            }
        });
        pHtml += '</tr>';
    });
    pHtml += '</tbody></table>';
    pairsDiv.innerHTML = pHtml;
}

function renderExportPreview() {
    const stats = computeStats();
    const div = document.getElementById('exportPreview');
    const totalDates = AppState.dates.length;
    const totalSlots = Object.values(AppState.calendar).reduce((sum, cal) => {
        return sum + ['8h-17h', '12h-21h', '16h-01h'].reduce((s, shift) => s + ((cal[shift] || []).length > 0 ? 1 : 0), 0);
    }, 0);
    const emptySlots = AppState.dates.reduce((sum, dk) => {
        const cal = AppState.calendar[dk] || {};
        let e = 0;
        ['8h-17h', '12h-21h'].forEach(s => { if (!cal[s] || cal[s].length === 0) e++; });
        return sum + e;
    }, 0);

    div.innerHTML = `<h3>📋 Resumo do Planeamento</h3>
        <div class="export-summary-grid">
            <div class="export-stat"><div class="export-stat-value">${AppState.employees.length}</div><div class="export-stat-label">Funcionários</div></div>
            <div class="export-stat"><div class="export-stat-value">${totalDates}</div><div class="export-stat-label">Datas</div></div>
            <div class="export-stat"><div class="export-stat-value">${totalSlots}</div><div class="export-stat-label">Turnos Atribuídos</div></div>
            <div class="export-stat"><div class="export-stat-value">${emptySlots}</div><div class="export-stat-label">Turnos Vazios</div></div>
        </div>`;
}
