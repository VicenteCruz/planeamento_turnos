/* ============================================
   STATISTICS & AUTO-FILL ALGORITHM
   ============================================ */

function computeStats() {
    const stats = {};
    AppState.employees.forEach(emp => {
        stats[emp] = { '8h-17h': 0, '12h-21h': 0, '16h-01h': 0, total: 0, daysWorked: 0 };
    });
    AppState.dates.forEach(dk => {
        const cal = AppState.calendar[dk];
        if (!cal) return;
        const workedToday = new Set();
        ['8h-17h', '12h-21h', '16h-01h'].forEach(shift => {
            if (cal[shift]) {
                cal[shift].forEach(emp => {
                    if (stats[emp]) {
                        stats[emp][shift]++;
                        stats[emp].total++;
                        workedToday.add(emp);
                    }
                });
            }
        });
        workedToday.forEach(emp => { stats[emp].daysWorked++; });
    });
    return stats;
}

function pairKey(a, b) {
    // Always sort alphabetically so the key is consistent
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function computePairs() {
    const pairs = {};
    // Initialize all possible pairs using consistent alphabetical key
    for (let i = 0; i < AppState.employees.length; i++) {
        for (let j = i + 1; j < AppState.employees.length; j++) {
            const key = pairKey(AppState.employees[i], AppState.employees[j]);
            pairs[key] = 0;
        }
    }

    AppState.dates.forEach(dk => {
        const cal = AppState.calendar[dk];
        if (!cal) return;
        ['8h-17h', '12h-21h', '16h-01h'].forEach(shift => {
            const people = cal[shift] || [];
            for (let i = 0; i < people.length; i++) {
                for (let j = i + 1; j < people.length; j++) {
                    const key = pairKey(people[i], people[j]);
                    if (pairs[key] !== undefined) pairs[key]++;
                }
            }
        });
    });
    return pairs;
}

function autoFillEmptyShifts(availableEmployees = AppState.employees, config2 = {morn:2, aft:2}, config3 = {morn:2, aft:2, night:1}, allowedDates = null) {
    // Recompute stats from scratch for accuracy
    let stats = computeStats();
    let pairs = computePairs();
    let filled = 0;

    AppState.dates.forEach(dk => {
        if (allowedDates && !allowedDates.has(dk)) return; // Skip excluded dates

        if (!AppState.calendar[dk]) AppState.calendar[dk] = {};
        const cal = AppState.calendar[dk];

        // Determine 'n' based on whether night is active today
        const hasNight = AppState.nightDates.has(dk);
        const config = hasNight ? config3 : config2;
        
        const nMorn = config.morn;
        const nAft = config.aft;
        const nNight = hasNight ? config.night : 0;

        // 1. FILL NIGHT SHIFT FIRST (if active and empty)
        if (hasNight && nNight > 0 && (!cal['16h-01h'] || cal['16h-01h'].length === 0)) {
            const busy = new Set();
            ['8h-17h', '12h-21h'].forEach(s => {
                if (cal[s]) cal[s].forEach(p => busy.add(p));
            });
            const available = availableEmployees.filter(e => !busy.has(e));
            
            if (available.length > 0) {
                const selected = pickBestForShift(available, '16h-01h', nNight, stats, pairs);
                cal['16h-01h'] = selected;
                updateRunningStats(selected, '16h-01h', stats, pairs);
                filled += selected.length;
            }
        }

        // 2. FILL MORNING AND AFTERNOON
        const morningFilled = cal['8h-17h'] && cal['8h-17h'].length > 0;
        const afternoonFilled = cal['12h-21h'] && cal['12h-21h'].length > 0;

        if (morningFilled && afternoonFilled) {
            return; // Already filled
        }

        // Determine who is available for morning/afternoon
        // Exclude anyone working the night shift or already busy
        const busyDay = new Set();
        ['8h-17h', '12h-21h', '16h-01h'].forEach(s => {
            if (cal[s]) cal[s].forEach(p => busyDay.add(p));
        });

        if (morningFilled && !afternoonFilled) {
            const available = availableEmployees.filter(e => !busyDay.has(e));
            cal['12h-21h'] = pickBestForShift(available, '12h-21h', nAft, stats, pairs);
            updateRunningStats(cal['12h-21h'], '12h-21h', stats, pairs);
            filled++;
            return;
        }
        if (!morningFilled && afternoonFilled) {
            const available = availableEmployees.filter(e => !busyDay.has(e));
            cal['8h-17h'] = pickBestForShift(available, '8h-17h', nMorn, stats, pairs);
            updateRunningStats(cal['8h-17h'], '8h-17h', stats, pairs);
            filled++;
            return;
        }

        // Neither shift filled
        const available = availableEmployees.filter(e => !busyDay.has(e));
        const bestSplit = findBestSplit(available, nMorn, nAft, stats, pairs);

        cal['8h-17h'] = bestSplit.morning;
        cal['12h-21h'] = bestSplit.afternoon;
        updateRunningStats(bestSplit.morning, '8h-17h', stats, pairs);
        updateRunningStats(bestSplit.afternoon, '12h-21h', stats, pairs);
        filled += 2;
    });

    return filled;
}

function findBestSplit(employees, nMorn, nAft, stats, pairs) {
    let combos = getCombinations(employees, nMorn);
    if (combos.length === 0) combos = [employees.slice()];

    let bestScore = -Infinity;
    let bestMorning = null;
    let bestAfternoon = null;

    combos.forEach(morning => {
        const morningSet = new Set(morning);
        const remaining = employees.filter(e => !morningSet.has(e));

        let aftCombos = getCombinations(remaining, nAft);
        if (aftCombos.length === 0) aftCombos = [remaining.slice()];

        aftCombos.forEach(afternoon => {
            const score = scoreSplit(morning, afternoon, stats, pairs);
            if (score > bestScore) {
                bestScore = score;
                bestMorning = morning;
                bestAfternoon = afternoon;
            }
        });
    });

    return { morning: bestMorning || [], afternoon: bestAfternoon || [] };
}

function scoreSplit(morning, afternoon, stats, pairs) {
    let score = 0;

    // MAXIMUM PRIORITY: Strict equality of shift types
    // Using exponential penalty (power of 3) ensures the algorithm will NEVER 
    // give a shift to someone who already has more of that shift than another person.
    morning.forEach(emp => {
        const s = stats[emp];
        if (!s) return;
        score -= Math.pow(s['8h-17h'] + 1, 3) * 1000;
        score -= s.total * 10;
    });

    afternoon.forEach(emp => {
        const s = stats[emp];
        if (!s) return;
        score -= Math.pow(s['12h-21h'] + 1, 3) * 1000;
        score -= s.total * 10;
    });

    // VERY HIGH PRIORITY: Pair diversity (exponential penalty)
    // Prevents "preferred pairs" by strongly penalizing pairs that already worked together.
    for (let i = 0; i < morning.length; i++) {
        for (let j = i + 1; j < morning.length; j++) {
            const key = pairKey(morning[i], morning[j]);
            const count = pairs[key] || 0;
            score -= Math.pow(count + 1, 3) * 100;
        }
    }
    for (let i = 0; i < afternoon.length; i++) {
        for (let j = i + 1; j < afternoon.length; j++) {
            const key = pairKey(afternoon[i], afternoon[j]);
            const count = pairs[key] || 0;
            score -= Math.pow(count + 1, 3) * 100;
        }
    }

    return score;
}

function pickBestForShift(available, shift, n, stats, pairs) {
    if (available.length <= n) return [...available];

    const combos = getCombinations(available, n);
    let bestScore = -Infinity;
    let bestGroup = null;

    combos.forEach(group => {
        let score = 0;
        group.forEach(emp => {
            const s = stats[emp];
            if (s) {
                // Strict equality penalty
                score -= Math.pow(s[shift] + 1, 3) * 1000;
                score -= s.total * 10;
            }
        });
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const key = pairKey(group[i], group[j]);
                const count = pairs[key] || 0;
                score -= Math.pow(count + 1, 3) * 100;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestGroup = group;
        }
    });

    return bestGroup || available.slice(0, n);
}

function updateRunningStats(people, shift, stats, pairs) {
    if (!people) return;
    people.forEach(emp => {
        if (!stats[emp]) stats[emp] = { '8h-17h': 0, '12h-21h': 0, '16h-01h': 0, total: 0, daysWorked: 0 };
        stats[emp][shift]++;
        stats[emp].total++;
    });
    for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
            const key = pairKey(people[i], people[j]);
            pairs[key] = (pairs[key] || 0) + 1;
        }
    }
}

function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const results = [];
    function combine(start, combo) {
        if (combo.length === k) { results.push([...combo]); return; }
        for (let i = start; i <= arr.length - (k - combo.length); i++) {
            combo.push(arr[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }
    combine(0, []);
    return results;
}
