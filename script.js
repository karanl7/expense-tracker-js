// Application State
let transactions = [];
let recurringTransactions = [];
let currentView = 'list';
let expenseChart = null;
let monthlyBudget = 0;
let selectedCurrency = 'INR';

// --- CONFIGURATION ---
const currencySymbols = {
    'USD': '$', 'EUR': '€', 'INR': '₹'
};
const categoryIcons = {
    food: '🍔', rent: '🏠', travel: '✈️', shopping: '🛒', other: '💼'
};

// --- DOM ELEMENTS ---
const elements = {
    // Form elements
    form: document.getElementById('transactionForm'),
    description: document.getElementById('description'),
    amount: document.getElementById('amount'),
    category: document.getElementById('category'),
    date: document.getElementById('date'),
    isRecurring: document.getElementById('isRecurring'),
    
    // Display elements
    totalBalance: document.getElementById('totalBalance'),
    totalIncome: document.getElementById('totalIncome'),
    totalExpenses: document.getElementById('totalExpenses'),
    transactionsList: document.getElementById('transactionsList'),
    
    // Budget elements
    monthlyBudget: document.getElementById('monthlyBudget'),
    setBudgetBtn: document.getElementById('setBudgetBtn'),
    budgetProgress: document.getElementById('budgetProgress'),
    progressFill: document.getElementById('progressFill'),
    progressSpent: document.getElementById('progressSpent'),
    progressRemaining: document.getElementById('progressRemaining'),
    
    // Filter elements
    searchFilter: document.getElementById('searchFilter'),
    categoryFilter: document.getElementById('categoryFilter'),
    clearFilters: document.getElementById('clearFilters'),
    
    // Control elements
    currencySelect: document.getElementById('currencySelect'),
    exportCsvBtn: document.getElementById('exportCsvBtn'), // Kept for reference
    downloadBackupBtn: document.getElementById('downloadBackupBtn'),
    importBackupBtn: document.getElementById('importBackupBtn'),
    importFileInput: document.getElementById('importFileInput'),
    themeToggle: document.getElementById('themeToggle'),
    viewBtns: document.querySelectorAll('.view-btn'),
    
    // View elements
    views: document.querySelectorAll('.view-content'),
    expenseChart: document.getElementById('expenseChart'),
    monthlySummary: document.getElementById('monthlySummary'),
    insightsContent: document.getElementById('insightsContent'),

    // Modal elements
    quickAddBtn: document.getElementById('quickAddBtn'),
    addTransactionModal: document.getElementById('addTransactionModal'),
    closeModalBtn: document.getElementById('closeModalBtn')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    elements.date.value = new Date().toISOString().split('T')[0];
    loadFromStorage();
    applyTheme(localStorage.getItem('theme') || 'dark');
    processRecurringTransactions();
    renderAll();
}

function renderAll() {
    renderTransactions();
    updateTotals();
    updateBudgetProgress();
    renderChart();
    renderMonthlySummary();
    renderInsights();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    elements.form.addEventListener('submit', handleAddTransaction);
    elements.setBudgetBtn.addEventListener('click', handleSetBudget);
    elements.searchFilter.addEventListener('input', debounce(renderTransactions, 300));
    elements.categoryFilter.addEventListener('change', renderTransactions);
    elements.clearFilters.addEventListener('click', clearFilters);
    elements.currencySelect.addEventListener('change', handleCurrencyChange);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.viewBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    // Backup & Restore
    elements.downloadBackupBtn.addEventListener('click', downloadBackup);
    elements.importBackupBtn.addEventListener('click', () => elements.importFileInput.click());
    elements.importFileInput.addEventListener('change', importBackup);
    // Modal
    elements.quickAddBtn.addEventListener('click', () => toggleModal(true));
    elements.closeModalBtn.addEventListener('click', () => toggleModal(false));
    elements.addTransactionModal.addEventListener('click', (e) => {
        if (e.target === elements.addTransactionModal) toggleModal(false);
    });
    // Keyboard Shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// --- THEME MANAGEMENT ---
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    elements.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
}
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
}

// --- MODAL MANAGEMENT ---
function toggleModal(show) {
    elements.addTransactionModal.classList.toggle('show', show);
}

// --- TRANSACTION MANAGEMENT ---
function handleAddTransaction(e) {
    // Prevents the form from submitting and reloading the page
    e.preventDefault();

    // Get the transaction type ('income' or 'expense') from the form
    // Assumes you have an input like <select id="type"> or radio buttons
    const type = document.getElementById('type').value;

    // Create the transaction object
    const transaction = {
        id: Date.now(),
        description: elements.description.value.trim(),
        // Use the 'type' to make the amount negative for expenses
        amount: parseFloat(elements.amount.value) * (type === 'expense' ? -1 : 1),
        category: elements.category.value,
        date: elements.date.value,
        isRecurring: elements.isRecurring.checked,
        type: type // Store the type for future reference
    };

    // Validate that all required fields are filled
    if (!transaction.description || isNaN(transaction.amount) || !transaction.category || !transaction.date) {
        alert('Please fill in all fields correctly.');
        return; // Stop the function if validation fails
    }
    
    // Add the transaction to the main list
    addTransaction(transaction);
    
    // If it's a recurring transaction, add a copy to the recurring list
    if (transaction.isRecurring) {
        // Using the modern spread syntax (...) is cleaner and less error-prone
        recurringTransactions.push({ ...transaction });
    }

    // Reset the form, set the date to today, and close the modal
    elements.form.reset();
    elements.date.value = new Date().toISOString().split('T')[0];
    toggleModal(false);
}

function addTransaction(transaction) {
    transactions.unshift(transaction);
    saveToStorage();
    renderAll();
}

window.deleteTransaction = function(id) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        transactions = transactions.filter(t => t.id !== id);
        saveToStorage();
        renderAll();
    }
};

function processRecurringTransactions() {
  if (!Array.isArray(recurringTransactions) || recurringTransactions.length === 0) return;
  const today = new Date();
  const currentMonthKey = today.toISOString().substring(0, 7);
  let changed = false;
  recurringTransactions.forEach(rec => {
    if (!rec || !rec.id) return;
    const existsThisMonth = transactions.some(t =>
      t.recurringId === rec.id && t.date && t.date.startsWith(currentMonthKey)
    );
    if (!existsThisMonth) {
      const newTx = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        description: (rec.description || 'Recurring') + ' (Recurring)',
        amount: rec.amount,
        category: rec.category || 'other',
        date: today.toISOString().split('T')[0],
        isRecurring: true,
        recurringId: rec.id,
        type: (rec.amount < 0 ? 'expense' : 'income')
      };
      transactions.unshift(newTx);
      changed = true;
    }
  });
  if (changed) saveToStorage();
}

// --- BUDGET & TOTALS ---
function handleSetBudget() {
    const budgetValue = parseFloat(elements.monthlyBudget.value);
    if (budgetValue > 0) {
        monthlyBudget = budgetValue;
        saveToStorage();
        updateBudgetProgress();
        elements.budgetProgress.style.display = 'block';
        elements.monthlyBudget.value = '';
    } else {
        alert('Please enter a valid budget amount.');
    }
}
function updateBudgetProgress() {
    if (monthlyBudget <= 0) {
        elements.budgetProgress.style.display = 'none';
        return;
    }
    const currentMonth = new Date().toISOString().substring(0, 7);
    const monthlyExpenses = transactions
        .filter(t => t.amount < 0 && t.date.startsWith(currentMonth))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const percentage = (monthlyExpenses / monthlyBudget) * 100;
    const remaining = monthlyBudget - monthlyExpenses;
    elements.progressFill.style.width = `${Math.min(percentage, 100)}%`;
    elements.progressFill.className = 'progress-fill';
    if (percentage >= 100) elements.progressFill.classList.add('danger');
    else if (percentage >= 70) elements.progressFill.classList.add('warning');
    elements.progressSpent.textContent = `Spent: ${formatCurrency(monthlyExpenses)}`;
    elements.progressRemaining.textContent = `Remaining: ${formatCurrency(Math.max(remaining, 0))}`;
    elements.budgetProgress.style.display = 'block';
}
function updateTotals() {
    const totals = transactions.reduce((acc, t) => {
        acc.balance += t.amount;
        if (t.amount > 0) acc.income += t.amount;
        else acc.expenses += t.amount;
        return acc;
    }, { balance: 0, income: 0, expenses: 0 });

    elements.totalBalance.textContent = formatCurrency(totals.balance);
    elements.totalIncome.textContent = formatCurrency(totals.income);
    elements.totalExpenses.textContent = formatCurrency(Math.abs(totals.expenses));
}

// --- RENDERING FUNCTIONS ---
function renderTransactions() {
  const filtered = getFilteredTransactions();
  elements.transactionsList.innerHTML = '';
  if (!filtered || filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-icon">📊</div><h3>No transactions found</h3><p>Click the '+' button to add one.</p>`;
    elements.transactionsList.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  filtered.forEach(tx => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    const desc = document.createElement('div');
    desc.className = 'transaction-description';
    desc.textContent = tx.description || '';

    const cat = document.createElement('div');
    cat.className = 'transaction-category';
    cat.textContent = `${categoryIcons[tx.category] || ''} ${tx.category}`;

    const amt = document.createElement('div');
    amt.className = 'transaction-amount ' + (tx.amount >= 0 ? 'amount-positive' : 'amount-negative');
    amt.textContent = formatCurrency(tx.amount);

    const date = document.createElement('div');
    date.className = 'transaction-date';
    date.textContent = formatDate(tx.date);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', 'Delete transaction');
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => deleteTransaction(tx.id));

    item.appendChild(desc);
    item.appendChild(cat);
    item.appendChild(amt);
    item.appendChild(date);
    item.appendChild(delBtn);

    frag.appendChild(item);
  });
  elements.transactionsList.appendChild(frag);
}
function renderChart() {
    const expenseData = getExpensesByCategory();
    const ctx = elements.expenseChart.getContext('2d');
    if (expenseChart) expenseChart.destroy();
    
    const labels = Object.keys(expenseData);
    const data = Object.values(expenseData);
    
    if (labels.length === 0) { /* Render empty chart state */ return; }

    const colors = ['#14B8A6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    
    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map(cat => `${categoryIcons[cat] || ''} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`),
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1E1E1E' : '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') }
                },
                tooltip: {
                    callbacks: {
                        label: (c) => `${c.label}: ${formatCurrency(c.raw)}`
                    }
                }
            }
        }
    });
}
function renderMonthlySummary() {
    const summary = getMonthlySummary();
    if (summary.length === 0) {
        elements.monthlySummary.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No monthly data</p></div>`;
        return;
    }
    elements.monthlySummary.innerHTML = summary.map(m => `
        <div class="summary-item">
            <div class="summary-month">${m.month}</div>
            <div class="summary-amount amount-positive">Income: ${formatCurrency(m.income)}</div>
            <div class="summary-amount amount-negative">Expenses: ${formatCurrency(Math.abs(m.expenses))}</div>
            <div class="summary-amount">Net: ${formatCurrency(m.net)}</div>
        </div>
    `).join('');
}
function renderInsights() {
    let insightsHTML = '';
    const now = new Date();
    const currentMonthKey = now.toISOString().substring(0, 7);
    const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
    const lastMonthKey = lastMonth.toISOString().substring(0, 7);

    // Insight 1: Biggest Expense Category
    const monthlyExpenses = transactions.filter(t => t.amount < 0 && t.date.startsWith(currentMonthKey));
    if (monthlyExpenses.length > 0) {
        const totalMonthlySpend = monthlyExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const spendByCategory = monthlyExpenses.reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
            return acc;
        }, {});
        const [topCategory, topAmount] = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1])[0];
        const percentage = ((topAmount / totalMonthlySpend) * 100).toFixed(0);
        insightsHTML += `<div class="insight-item">Your biggest expense category this month is ${categoryIcons[topCategory]} <strong>${topCategory}</strong> (${percentage}% of total).</div>`;
    }

    // Insight 2: Comparison to Last Month
    const foodCurrentMonth = transactions.filter(t => t.date.startsWith(currentMonthKey) && t.category === 'food' && t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const foodLastMonth = transactions.filter(t => t.date.startsWith(lastMonthKey) && t.category === 'food' && t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    if (foodCurrentMonth > 0 && foodLastMonth > 0) {
        const diff = ((foodCurrentMonth - foodLastMonth) / foodLastMonth) * 100;
        insightsHTML += `<div class="insight-item">You spent <strong>${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'more' : 'less'}</strong> on ${categoryIcons.food} Food compared to last month.</div>`;
    }
    
    // Insight 3: Budget Exceeded
    if (monthlyBudget > 0) {
        const totalMonthlySpend = monthlyExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        if (totalMonthlySpend > monthlyBudget) {
            insightsHTML += `<div class="insight-item">⚠️ You've exceeded your monthly budget by <strong>${formatCurrency(totalMonthlySpend - monthlyBudget)}</strong>.</div>`;
        }
    }

    elements.insightsContent.innerHTML = insightsHTML || `<div class="empty-state"><div class="empty-icon">💡</div><p>Not enough data for insights yet.</p></div>`;
}

// --- DATA PROCESSING & FILTERS ---
function getFilteredTransactions() {
    const searchTerm = elements.searchFilter.value.toLowerCase();
    const category = elements.categoryFilter.value;
    return transactions.filter(t => 
        (t.description.toLowerCase().includes(searchTerm)) && 
        (!category || t.category === category)
    );
}
function getExpensesByCategory() {
    return transactions.filter(t => t.amount < 0).reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
        return acc;
    }, {});
}
function getMonthlySummary() {
  const monthlyData = {};
  transactions.forEach(t => {
    if (!t || !t.date) return;
    const monthKey = t.date.substring(0, 7);
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expenses: 0 };
    if (t.amount > 0) monthlyData[monthKey].income += t.amount;
    else monthlyData[monthKey].expenses += t.amount;
  });
  return Object.entries(monthlyData)
    .map(([monthKey, data]) => ({
      monthKey,
      month: formatMonthYear(monthKey),
      income: data.income,
      expenses: data.expenses,
      net: data.income + data.expenses
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, 6);
}
function clearFilters() {
    elements.searchFilter.value = '';
    elements.categoryFilter.value = '';
    renderTransactions();
}

// --- VIEW MANAGEMENT ---
function switchView(view) {
    currentView = view;
    elements.viewBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    elements.views.forEach(v => v.classList.toggle('active', v.id === `${view}View`));
    if (view === 'chart') setTimeout(() => renderChart(), 100);
    if (view === 'insights') renderInsights();
}

// --- BACKUP & RESTORE ---
function downloadBackup() {
    const data = {
        transactions,
        recurringTransactions,
        monthlyBudget,
        selectedCurrency
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
function validateBackup(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.transactions)) return false;
  if (data.transactions.length > 0) {
    const tx = data.transactions[0];
    if (!tx.id || typeof tx.amount !== 'number' || !tx.date) return false;
  }
  return true;
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    if (!confirm('Are you sure you want to import this backup? This will overwrite all current data.')) {
      elements.importFileInput.value = '';
      return;
    }
    try {
      const data = JSON.parse(e.target.result);
      if (!validateBackup(data)) throw new Error('Invalid backup format');
      transactions = data.transactions || [];
      recurringTransactions = data.recurringTransactions || [];
      monthlyBudget = data.monthlyBudget || 0;
      selectedCurrency = data.selectedCurrency || selectedCurrency || 'USD';
      elements.currencySelect.value = selectedCurrency;
      saveToStorage();
      renderAll();
    } catch (error) {
      alert('Error: Invalid backup file. ' + (error.message || ''));
      console.error('Import backup error', error);
    } finally {
      elements.importFileInput.value = '';
    }
  };
  reader.readAsText(file);
}

// --- STORAGE ---
function saveToStorage() {
    localStorage.setItem('expense-tracker-data', JSON.stringify({
        transactions, recurringTransactions, monthlyBudget, selectedCurrency
    }));
}
function loadFromStorage() {
    const saved = localStorage.getItem('expense-tracker-data');
    if (saved) {
        const data = JSON.parse(saved);
        transactions = data.transactions || [];
        recurringTransactions = data.recurringTransactions || [];
        monthlyBudget = data.monthlyBudget || 0;
        selectedCurrency = data.selectedCurrency || 'USD';
        elements.currencySelect.value = selectedCurrency;
    }
}

// --- UTILITIES ---
function formatCurrency(amount) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: selectedCurrency || 'USD',
      maximumFractionDigits: 2
    }).format(amount);
  } catch (err) {
    const symbol = currencySymbols[selectedCurrency] || '$';
    const sign = amount < 0 ? '-' : '';
    return `${sign}${symbol}${Math.abs(amount).toFixed(2)}`;
  }
}
function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}
function formatMonthYear(monthString) {
    const [year, month] = monthString.split('-');
    return new Date(year, month - 1).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long'
    });
}
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
function handleKeyboardShortcuts(e) {
    if (e.key === 'Escape' && elements.addTransactionModal.classList.contains('show')) {
        toggleModal(false);
    }
}
function handleCurrencyChange() {
    selectedCurrency = elements.currencySelect.value;
    saveToStorage();
    renderAll();
}