/* ============================================
   MAIN APP — Event Handlers & Navigation
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Step navigation
    const stepBtns = document.querySelectorAll('.step-btn');
    const panels = document.querySelectorAll('.panel');

    function goToStep(step) {
        stepBtns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        document.querySelector(`[data-step="${step}"]`).classList.add('active');
        document.getElementById(`panel${step.charAt(0).toUpperCase() + step.slice(1)}`).classList.add('active');

        if (step === 'calendar') renderCalendar();
        if (step === 'stats') renderStats();
        if (step === 'export') renderExportPreview();
    }

    stepBtns.forEach(btn => {
        btn.addEventListener('click', () => goToStep(btn.dataset.step));
    });

    // Setup: employee count changes
    document.getElementById('numEmployees').addEventListener('change', renderEmployeeInputs);
    renderEmployeeInputs();

    // Apply setup
    document.getElementById('btnApplySetup').addEventListener('click', () => {
        const n = parseInt(document.getElementById('numEmployees').value) || 4;
        const employees = [];
        for (let i = 0; i < n; i++) {
            const inp = document.getElementById(`empName${i}`);
            const name = inp ? inp.value.trim() : '';
            employees.push(name || `Func${i + 1}`);
        }
        AppState.employees = employees;
        AppState.personsPerShift = parseInt(document.getElementById('personsPerShift').value) || 2;

        toast('Configuração aplicada!', 'success');
        document.getElementById('stepSetup').classList.add('completed');
        goToStep('import');
    });

    // File import - drag & drop
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) importExcel(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) importExcel(fileInput.files[0]);
    });

    // Start fresh
    document.getElementById('btnStartFresh').addEventListener('click', () => {
        AppState.calendar = {};
        AppState.dates = [];
        AppState.nightDates = new Set();
        toast('Começando do zero. Adiciona datas no calendário.', 'info');
        document.getElementById('stepImport').classList.add('completed');
        goToStep('calendar');
    });

    // === Add dates modal (date range picker) ===
    function computeDateRange() {
        const startVal = document.getElementById('dateRangeStart').value;
        const endVal = document.getElementById('dateRangeEnd').value;
        if (!startVal || !endVal) return [];

        const start = new Date(startVal);
        const end = new Date(endVal);
        if (start > end) return [];

        // Get selected weekdays
        const selectedDays = new Set();
        document.querySelectorAll('.weekday-selector input[type="checkbox"]').forEach(cb => {
            if (cb.checked) selectedDays.add(parseInt(cb.value));
        });

        const dates = [];
        const current = new Date(start);
        while (current <= end) {
            if (selectedDays.has(current.getDay())) {
                dates.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    function updateDatePreview() {
        const dates = computeDateRange();
        const preview = document.getElementById('datePreviewCount');
        const existing = dates.filter(d => AppState.dates.includes(dateKey(d))).length;
        const newDates = dates.length - existing;
        if (dates.length > 0) {
            preview.textContent = `📊 ${dates.length} datas no intervalo (${newDates} novas, ${existing} já existentes)`;
        } else {
            preview.textContent = '';
        }
    }

    document.getElementById('btnAddDates').addEventListener('click', () => {
        // Pre-fill with smart defaults
        const today = new Date();
        const startInput = document.getElementById('dateRangeStart');
        const endInput = document.getElementById('dateRangeEnd');
        if (!startInput.value) {
            startInput.value = formatDateFull(today);
        }
        if (!endInput.value) {
            const nextMonth = new Date(today);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            endInput.value = formatDateFull(nextMonth);
        }
        updateDatePreview();
        document.getElementById('addDatesModal').classList.remove('hidden');
    });

    // Live preview update when dates change
    document.getElementById('dateRangeStart').addEventListener('change', updateDatePreview);
    document.getElementById('dateRangeEnd').addEventListener('change', updateDatePreview);
    document.querySelectorAll('.weekday-selector input').forEach(cb => {
        cb.addEventListener('change', updateDatePreview);
    });

    document.getElementById('btnCancelDates').addEventListener('click', () => {
        document.getElementById('addDatesModal').classList.add('hidden');
    });

    document.getElementById('btnConfirmDates').addEventListener('click', () => {
        const dates = computeDateRange();
        const includeNight = document.getElementById('newDatesNight').checked;
        let added = 0;

        dates.forEach(d => {
            const dk = dateKey(d);
            if (!AppState.dates.includes(dk)) {
                AppState.dates.push(dk);
                AppState.calendar[dk] = { '8h-17h': [], '12h-21h': [] };
                if (includeNight) {
                    AppState.calendar[dk]['16h-01h'] = [];
                    AppState.nightDates.add(dk);
                    if (!AppState.includeNight) {
                        AppState.includeNight = true;
                    }
                }
                added++;
            }
        });

        // Sort dates chronologically
        AppState.dates.sort();

        document.getElementById('addDatesModal').classList.add('hidden');
        toast(`${added} data(s) adicionada(s)!`, added > 0 ? 'success' : 'info');
        renderCalendar();
    });

    // Auto-fill Modal Trigger
    document.getElementById('btnAutoFill').addEventListener('click', () => {
        // Populate employees
        const empContainer = document.getElementById('autoFillEmployees');
        empContainer.innerHTML = '';
        AppState.employees.forEach(emp => {
            const label = document.createElement('label');
            label.className = 'weekday-chip';
            label.style.marginBottom = '8px';
            label.innerHTML = `<input type="checkbox" value="${emp}" checked><span>${emp}</span>`;
            empContainer.appendChild(label);
        });

        // Propose configurations
        const total = AppState.employees.length;
        const default2 = Math.max(1, Math.floor(total / 2));
        document.getElementById('autoFill2_morn').value = default2;
        document.getElementById('autoFill2_aft').value = Math.max(1, total - default2);

        const default3 = Math.max(1, Math.floor(total / 3));
        document.getElementById('autoFill3_morn').value = default3;
        document.getElementById('autoFill3_aft').value = default3;
        document.getElementById('autoFill3_night').value = Math.max(1, total - (default3 * 2));

        // Populate dates grouping by Month
        const datesContainer = document.getElementById('autoFillDates');
        datesContainer.innerHTML = '';

        const datesByMonth = {};
        AppState.dates.forEach(dk => {
            const parts = dk.split('-');
            const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
            const monthKey = d.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });
            if (!datesByMonth[monthKey]) datesByMonth[monthKey] = [];
            datesByMonth[monthKey].push({ dk, d });
        });

        for (const [month, days] of Object.entries(datesByMonth)) {
            const monthDiv = document.createElement('div');
            monthDiv.className = 'mini-calendar-month';
            monthDiv.innerHTML = `<div class="mini-calendar-title">${month}</div>`;
            const grid = document.createElement('div');
            grid.className = 'mini-calendar-grid';

            days.forEach(({ dk, d }) => {
                const label = document.createElement('label');
                label.className = 'mini-calendar-day active';
                label.innerHTML = `
                    <input type="checkbox" value="${dk}" checked>
                    <span class="day-num">${d.getDate()}</span>
                    <span class="day-name">${d.toLocaleString('pt-PT', { weekday: 'short' }).replace('.', '')}</span>
                `;
                label.querySelector('input').addEventListener('change', function () {
                    if (this.checked) { label.classList.add('active'); label.classList.remove('inactive'); }
                    else { label.classList.remove('active'); label.classList.add('inactive'); }
                });
                grid.appendChild(label);
            });
            monthDiv.appendChild(grid);
            datesContainer.appendChild(monthDiv);
        }

        document.getElementById('autoFillModal').classList.remove('hidden');
    });

    document.getElementById('btnCancelAutoFill').addEventListener('click', () => {
        document.getElementById('autoFillModal').classList.add('hidden');
    });

    document.getElementById('btnConfirmAutoFill').addEventListener('click', () => {
        const empCheckboxes = document.querySelectorAll('#autoFillEmployees input:checked');
        const availableEmployees = Array.from(empCheckboxes).map(cb => cb.value);

        const dateCheckboxes = document.querySelectorAll('#autoFillDates input:checked');
        const allowedDates = new Set(Array.from(dateCheckboxes).map(cb => cb.value));

        const config2 = {
            morn: parseInt(document.getElementById('autoFill2_morn').value) || 0,
            aft: parseInt(document.getElementById('autoFill2_aft').value) || 0
        };
        const config3 = {
            morn: parseInt(document.getElementById('autoFill3_morn').value) || 0,
            aft: parseInt(document.getElementById('autoFill3_aft').value) || 0,
            night: parseInt(document.getElementById('autoFill3_night').value) || 0
        };

        document.getElementById('autoFillModal').classList.add('hidden');

        const filled = autoFillEmptyShifts(availableEmployees, config2, config3, allowedDates);
        toast(`${filled} turno(s) preenchido(s) automaticamente!`, 'success');
        renderCalendar();
        renderStats();
    });

    // Cell edit modal
    document.getElementById('btnCancelEdit').addEventListener('click', () => {
        document.getElementById('cellEditModal').classList.add('hidden');
    });
    document.getElementById('btnConfirmEdit').addEventListener('click', () => {
        const modal = document.getElementById('cellEditModal');
        const dk = modal._dk;
        const shift = modal._shift;
        const checkboxes = document.querySelectorAll('#cellEditCheckboxes input[type="checkbox"]');
        const selected = [];
        checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });

        if (!AppState.calendar[dk]) AppState.calendar[dk] = {};

        if (shift === '16h-01h') {
            const isActive = document.getElementById('cellEditActiveToggle').checked;
            if (!isActive) {
                AppState.calendar[dk][shift] = [];
                AppState.nightDates.delete(dk);
            } else {
                AppState.calendar[dk][shift] = selected;
                AppState.nightDates.add(dk);
            }
        } else {
            AppState.calendar[dk][shift] = selected;
        }

        modal.classList.add('hidden');
        renderCalendar();
        renderStats();
    });

    // Export
    document.getElementById('btnExport').addEventListener('click', exportExcel);

    // Theme toggle
    document.getElementById('btnThemeToggle').addEventListener('click', function () {
        const isDark = document.body.classList.toggle('dark-theme');
        if (isDark) {
            this.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>`;
        } else {
            this.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>`;
        }
    });

    // Single Day Auto-Fill logic
    window.openSingleDayAutoFill = function (dk) {
        const modal = document.getElementById('singleDayAutoFillModal');
        modal._targetDate = dk;

        const parts = dk.split('-');
        const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        document.getElementById('singleDayAutoFillTitle').textContent = `✨ Auto-Preencher — ${formatDate(d)}`;

        const empContainer = document.getElementById('singleDayAutoFillEmployees');
        empContainer.innerHTML = '';
        AppState.employees.forEach(emp => {
            const label = document.createElement('label');
            label.className = 'weekday-chip';
            label.style.marginBottom = '8px';
            label.innerHTML = `<input type="checkbox" value="${emp}" checked><span>${emp}</span>`;
            empContainer.appendChild(label);
        });

        const total = AppState.employees.length;
        const hasNight = AppState.nightDates.has(dk);

        if (hasNight) {
            document.getElementById('singleDayAutoFill_nightGroup').style.display = 'block';
            const default3 = Math.max(1, Math.floor(total / 3));
            document.getElementById('singleDayAutoFill_morn').value = default3;
            document.getElementById('singleDayAutoFill_aft').value = default3;
            document.getElementById('singleDayAutoFill_night').value = Math.max(1, total - (default3 * 2));
        } else {
            document.getElementById('singleDayAutoFill_nightGroup').style.display = 'none';
            const default2 = Math.max(1, Math.floor(total / 2));
            document.getElementById('singleDayAutoFill_morn').value = default2;
            document.getElementById('singleDayAutoFill_aft').value = Math.max(1, total - default2);
        }

        modal.classList.remove('hidden');
    };

    document.getElementById('btnCancelSingleDayAutoFill').addEventListener('click', () => {
        document.getElementById('singleDayAutoFillModal').classList.add('hidden');
    });

    document.getElementById('btnConfirmSingleDayAutoFill').addEventListener('click', () => {
        const modal = document.getElementById('singleDayAutoFillModal');
        const targetDate = modal._targetDate;

        const empCheckboxes = document.querySelectorAll('#singleDayAutoFillEmployees input:checked');
        const availableEmployees = Array.from(empCheckboxes).map(cb => cb.value);

        const config = {
            morn: parseInt(document.getElementById('singleDayAutoFill_morn').value) || 0,
            aft: parseInt(document.getElementById('singleDayAutoFill_aft').value) || 0,
            night: parseInt(document.getElementById('singleDayAutoFill_night').value) || 0
        };

        modal.classList.add('hidden');

        // Execute auto-fill only for this day
        // To do this simply, we will clear the shifts for this day, then run autoFillEmptyShifts restricting to this single date
        AppState.calendar[targetDate]['8h-17h'] = [];
        AppState.calendar[targetDate]['12h-21h'] = [];
        if (AppState.nightDates.has(targetDate)) {
            AppState.calendar[targetDate]['16h-01h'] = [];
        }

        const allowedDates = new Set([targetDate]);
        const hasNight = AppState.nightDates.has(targetDate);

        let filled;
        if (hasNight) {
            filled = autoFillEmptyShifts(availableEmployees, null, config, allowedDates);
        } else {
            filled = autoFillEmptyShifts(availableEmployees, config, null, allowedDates);
        }

        toast(`Turnos de ${targetDate} preenchidos automaticamente!`, 'success');
        renderCalendar();
        renderStats();
    });
});

