// ============================================
// CONFIGURATION - UPDATE THIS URL AFTER DEPLOYMENT
// ============================================
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxeBMerKgXFX0L3ZsKZHMkayCKFFoCek3NtdAb3UNYjJOsX6L9vya9Low1LL1FQHo1u/exec";

// Session Configuration
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
let sessionTimer = null;
let sessionExpiry = null;

// App State
let currentUser = null;
let branchChartInstance = null;
let currentBranchData = [];
let globalData = [];
let currentCustomer = "";
let chartInstances = [];

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    
    // Show loading state
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span>⏳</span> Authenticating...';
    errorDiv.classList.remove('show');
    
    try {
        // Build URL with parameters
        const params = new URLSearchParams({
            action: 'authenticate',
            username: username,
            password: password
        });
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();
        
        if (result.success) {
            // Store session data
            currentUser = {
                username: result.user.username,
                role: result.user.role,
                department: result.user.department,
                email: result.user.email,
                sessionToken: result.sessionToken,
                loginTime: new Date().toISOString()
            };
            
            // Save to session storage
            sessionStorage.setItem('pgcpi_user', JSON.stringify(currentUser));
            sessionStorage.setItem('pgcpi_sessionExpiry', Date.now() + SESSION_TIMEOUT);
            
            // Start session timer
            startSessionTimer();
            
            // Show main app
            showMainApp();
            
            // Clear form
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            
        } else {
            showLoginError(result.message || 'Authentication failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Connection failed. Please try again.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>🔐</span> Secure Login';
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    document.getElementById('loginErrorText').textContent = message;
    errorDiv.classList.add('show');
}

function startSessionTimer() {
    sessionExpiry = Date.now() + SESSION_TIMEOUT;
    
    // Update timer display every minute
    if (sessionTimer) clearInterval(sessionTimer);
    
    updateSessionDisplay();
    
    sessionTimer = setInterval(() => {
        const remaining = sessionExpiry - Date.now();
        
        if (remaining <= 0) {
            handleLogout();
            alert('Session expired. Please login again.');
            return;
        }
        
        updateSessionDisplay();
        
    }, 60000); // Update every minute
}

function updateSessionDisplay() {
    const remaining = sessionExpiry - Date.now();
    const minutes = Math.max(0, Math.floor(remaining / 60000));
    const timerDisplay = document.getElementById('sessionTimer');
    
    if (timerDisplay) {
        timerDisplay.textContent = `Session: ${minutes}m remaining`;
        if (minutes < 5) timerDisplay.style.color = 'var(--danger)';
        else timerDisplay.style.color = 'var(--text-muted)';
    }
}

function handleLogout() {
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = null;
    }
    
    sessionStorage.removeItem('pgcpi_user');
    sessionStorage.removeItem('pgcpi_sessionExpiry');
    currentUser = null;
    
    // Destroy charts
    chartInstances.forEach(chart => chart.destroy());
    chartInstances = [];
    if (branchChartInstance) {
        branchChartInstance.destroy();
        branchChartInstance = null;
    }
    
    location.reload();
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').classList.add('logged-in');
    
    if (currentUser) {
        document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
        document.getElementById('userNameDisplay').textContent = currentUser.username;
        document.getElementById('userRoleDisplay').textContent = currentUser.role;
        document.getElementById('welcomeUser').textContent = currentUser.username;
        document.getElementById('reportGeneratedBy').textContent = currentUser.username;
    }
}

function checkExistingSession() {
    const saved = sessionStorage.getItem('pgcpi_user');
    const expiry = sessionStorage.getItem('pgcpi_sessionExpiry');
    
    if (saved && expiry) {
        if (Date.now() > parseInt(expiry)) {
            // Session expired
            sessionStorage.removeItem('pgcpi_user');
            sessionStorage.removeItem('pgcpi_sessionExpiry');
            return;
        }
        
        try {
            currentUser = JSON.parse(saved);
            sessionExpiry = parseInt(expiry);
            startSessionTimer();
            showMainApp();
        } catch (e) {
            sessionStorage.removeItem('pgcpi_user');
            sessionStorage.removeItem('pgcpi_sessionExpiry');
        }
    }
}

// ============================================
// TAB NAVIGATION
// ============================================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', { 
        style: 'currency', 
        currency: 'PHP', 
        minimumFractionDigits: 2 
    }).format(amount || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateReportNumber() {
    return 'PMFS-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
}

// ============================================
// MONITORING SEARCH
// ============================================
async function searchCustomer() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const id = document.getElementById('customerId').value.trim();
    if (!id) {
        showError('Please enter a Customer ID');
        return;
    }

    currentCustomer = id;
    const container = document.getElementById('resultsContainer');
    
    chartInstances.forEach(chart => chart.destroy());
    chartInstances = [];

    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Retrieving customer records...</p>
        </div>
    `;

    try {
        const params = new URLSearchParams({
            action: 'getCustomer',
            customerId: id
        });
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>${escapeHtml(result.message)}</span>
                </div>
            `;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>No records found for Customer ID: <strong>${escapeHtml(id)}</strong></span>
                </div>
            `;
            globalData = [];
            return;
        }

        globalData = result.data;
        renderDashboard(globalData);

    } catch (error) {
        console.error('Search error:', error);
        showError('Failed to retrieve data. Please check your connection and try again.');
    }
}

function showError(message) {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="alert alert-error">
            <span>⚠️</span>
            <span>${message}</span>
        </div>
    `;
}

// ============================================
// DASHBOARD RENDERING
// ============================================
function calculateStats(data) {
    const totalAmount = data.reduce((sum, row) => sum + (parseFloat(row["Amount"]) || 0), 0);
    const highRisk = data.filter(r => r["Status"]?.toLowerCase() === "high").length;
    const normal = data.filter(r => r["Status"]?.toLowerCase() === "normal").length;
    
    const assignedToCounts = data.reduce((acc, row) => {
        const name = row["Assigned To"] || row["Assisgned to"];
        if (name) acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});
    
    const uniqueAssignedTo = Object.keys(assignedToCounts);
    let mostAssignedTo = 'Unassigned';
    let maxCount = 0;
    
    Object.entries(assignedToCounts).forEach(([name, count]) => {
        if (count > maxCount) {
            maxCount = count;
            mostAssignedTo = name;
        }
    });
    
    const branchCounts = data.reduce((acc, row) => {
        const branch = row["Assigned Branch"];
        if (branch) acc[branch] = (acc[branch] || 0) + 1;
        return acc;
    }, {});
    
    return { 
        totalRecords: data.length, 
        totalAmount, 
        highRisk, 
        normal, 
        uniqueAssignedTo, 
        assignedToCounts, 
        mostAssignedTo, 
        mostAssignedCount: maxCount, 
        branchCounts 
    };
}

function generateMonthlySummary(data) {
    const summary = {};
    data.forEach(row => {
        const date = new Date(row["Date of Alert"]);
        const amount = parseFloat(row["Amount"]) || 0;
        if (isNaN(date)) return;
        const year = date.getFullYear();
        const month = date.getMonth();
        if (!summary[year]) summary[year] = Array(12).fill(0).map(() => ({ count: 0, total: 0 }));
        summary[year][month].count++;
        summary[year][month].total += amount;
    });
    return summary;
}

function renderDashboard(data) {
    const container = document.getElementById('resultsContainer');
    const stats = calculateStats(data);
    const customerName = data[0]["Customer Name"] || "Unknown Customer";

    const html = `
        <div class="fade-in">
            ${renderStatsCards(stats)}
            <div class="content-grid">
                ${renderCustomerInfoCard(data[0])}
                ${renderBranchesCard(stats.branchCounts)}
            </div>
            <div class="content-grid">
                ${renderDocumentsCard(data)}
                ${renderCaseAssignmentCard(stats.mostAssignedTo, stats.mostAssignedCount, stats.assignedToCounts)}
            </div>
            ${renderAssignedToCard(stats.uniqueAssignedTo)}
            ${renderTransactionTable(data)}
            <div class="chart-grid">${renderCharts(data)}</div>
        </div>
    `;

    container.innerHTML = html;
    initializeCharts(data);
}

function renderStatsCards(stats) {
    return `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header"><span class="stat-label">Total Records</span><span class="stat-icon">📋</span></div>
                <div class="stat-value">${stats.totalRecords}</div>
                <div class="stat-subtext">Transaction alerts</div>
            </div>
            <div class="stat-card">
                <div class="stat-header"><span class="stat-label">Total Amount</span><span class="stat-icon">💰</span></div>
                <div class="stat-value">${formatCurrency(stats.totalAmount)}</div>
                <div class="stat-subtext">Cumulative value</div>
            </div>
            <div class="stat-card info">
                <div class="stat-header"><span class="stat-label">Assigned Officers</span><span class="stat-icon">👥</span></div>
                <div class="stat-value">${stats.uniqueAssignedTo.length}</div>
                <div class="stat-subtext">Unique personnel</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-header"><span class="stat-label">Branches</span><span class="stat-icon">🏢</span></div>
                <div class="stat-value">${Object.keys(stats.branchCounts).length}</div>
                <div class="stat-subtext">Processing locations</div>
            </div>
        </div>
    `;
}

function renderCustomerInfoCard(record) {
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">👤 Customer Profile</div></div>
            <div class="card-body">
                <div class="record-field" style="margin-bottom: 15px;">
                    <span class="record-label">Customer Name</span>
                    <span class="record-value" style="font-size: 1.2rem;">${escapeHtml(record["Customer Name"]) || 'N/A'}</span>
                </div>
                <div class="record-field" style="margin-bottom: 15px;">
                    <span class="record-label">Customer ID</span>
                    <span class="record-value">${escapeHtml(currentCustomer)}</span>
                </div>
                <div class="record-field">
                    <span class="record-label">Account Status</span>
                    <span class="record-value" style="color: var(--success);">● Active</span>
                </div>
            </div>
        </div>
    `;
}

function renderBranchesCard(branchCounts) {
    const branches = Object.entries(branchCounts).sort((a, b) => b[1] - a[1]);
    if (branches.length === 0) {
        return `<div class="card"><div class="card-header"><div class="card-title">🏢 Assigned Branches</div></div><div class="card-body"><div style="text-align: center; padding: 40px; color: var(--text-muted);">No branch data available.</div></div></div>`;
    }
    const branchItems = branches.map(([branch, count]) => `
        <div class="branch-item"><span class="branch-name">${escapeHtml(branch)}</span><span class="branch-count">${count}</span></div>
    `).join('');
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">🏢 Assigned Branches</div><span style="font-size: 0.9rem; color: var(--text-muted);">${branches.length} branch(es)</span></div>
            <div class="card-body" style="padding: 20px;"><div class="branches-grid">${branchItems}</div></div>
        </div>
    `;
}

function renderDocumentsCard(data) {
    const documents = [];
    const seenDocs = new Set();
    data.forEach(row => {
        const docName = row["Document"];
        const validity = row["Validity"];
        const link = row["Document Link"];
        if (docName && !seenDocs.has(docName)) {
            seenDocs.add(docName);
            documents.push({ name: docName, validity: validity, link: link });
        }
    });
    if (documents.length === 0) {
        return `<div class="card"><div class="card-header"><div class="card-title">📎 Documents Submitted</div></div><div class="card-body"><div style="text-align: center; padding: 40px; color: var(--text-muted);">No documents available.</div></div></div>`;
    }
    const rows = documents.map((doc, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(doc.name)}</strong></td>
            <td>${formatDate(doc.validity)}</td>
            <td>${doc.link ? `<a href="${escapeHtml(doc.link)}" target="_blank" class="doc-link"><span>📄</span><span>View</span></a>` : '<span style="color: var(--text-muted);">—</span>'}</td>
        </tr>
    `).join('');
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">📎 Documents Submitted</div><span style="font-size: 0.9rem; color: var(--text-muted);">${documents.length} document(s)</span></div>
            <div class="card-body" style="padding: 0;">
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th style="width: 50px;">#</th><th>Document Name</th><th>Validity</th><th style="width: 100px;">Action</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderCaseAssignmentCard(mostAssignedTo, count, allCounts) {
    const total = Object.values(allCounts).reduce((a, b) => a + b, 0);
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
        <div class="card">
            <div class="card-header"><div class="card-title">🎯 Case Assignment</div><span style="font-size: 0.9rem; color: var(--text-muted);">Primary Officer</span></div>
            <div class="card-body">
                <div style="display: flex; align-items: center; gap: 15px; padding: 10px 0;">
                    <div style="width: 70px; height: 70px; background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: white; font-weight: 700;">${mostAssignedTo.charAt(0).toUpperCase()}</div>
                    <div style="flex: 1;">
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(mostAssignedTo)}</div>
                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 8px;">Primary Case Officer</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="flex: 1; height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden;">
                                <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%);"></div>
                            </div>
                            <span style="font-size: 0.8rem; font-weight: 600; color: var(--accent);">${count} of ${total} (${percentage}%)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAssignedToCard(uniqueNames) {
    if (uniqueNames.length === 0) {
        return `<div class="card" style="margin-bottom: 30px;"><div class="card-header"><div class="card-title">👥 Assigned To</div></div><div class="card-body"><div style="text-align: center; padding: 40px; color: var(--text-muted);">No assigned officers found.</div></div></div>`;
    }
    const items = uniqueNames.map(name => `
        <div class="assigned-to-item"><div class="assigned-to-avatar">${name.charAt(0).toUpperCase()}</div><span class="assigned-to-name">${escapeHtml(name)}</span></div>
    `).join('');
    return `
        <div class="card" style="margin-bottom: 30px;">
            <div class="card-header"><div class="card-title">👥 Assigned To</div><span style="font-size: 0.9rem; color: var(--text-muted);">${uniqueNames.length} officer(s)</span></div>
            <div class="card-body" style="padding: 20px;"><div class="assigned-to-list">${items}</div></div>
        </div>
    `;
}

function renderTransactionTable(data) {
    const rows = data.map((row, index) => {
        const amount = parseFloat(row["Amount"]) || 0;
        const isHigh = row["Status"]?.toLowerCase() === "high";
        const assignedTo = row["Assigned To"] || row["Assisgned to"] || '—';
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${formatDate(row["Date of Alert"])}</td>
                <td>${escapeHtml(row["Transaction Type"]) || 'General'}</td>
                <td class="amount ${isHigh ? 'amount-high' : ''}">${formatCurrency(amount)}</td>
                <td><span class="status-badge ${isHigh ? 'status-high' : 'status-normal'}">${escapeHtml(row["Status"]) || 'Unknown'}</span></td>
                <td class="assigned-to">${escapeHtml(assignedTo)}</td>
            </tr>
        `;
    }).join('');
    return `
        <div class="card" style="margin-bottom: 30px;">
            <div class="card-header"><div class="card-title">📋 Transaction History</div><span style="font-size: 0.9rem; color: var(--text-muted);">${data.length} records found</span></div>
            <div class="card-body" style="padding: 0;">
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th style="width: 50px;">#</th><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Assigned To</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderCharts(data) {
    const summary = generateMonthlySummary(data);
    const years = Object.keys(summary).sort();
    if (years.length === 0) return '';
    return years.map(year => `
        <div class="chart-container">
            <div class="chart-header"><div class="chart-title">📈 Monthly Analysis - ${year}</div></div>
            <div class="chart-wrapper"><canvas id="chart-${year}"></canvas></div>
        </div>
    `).join('');
}

function initializeCharts(data) {
    const summary = generateMonthlySummary(data);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    Object.keys(summary).forEach(year => {
        const ctx = document.getElementById(`chart-${year}`);
        if (!ctx) return;
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Alert Count', data: summary[year].map(m => m.count), backgroundColor: 'rgba(30, 58, 95, 0.8)', borderColor: 'rgba(30, 58, 95, 1)', borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
                    { label: 'Amount (PHP)', data: summary[year].map(m => m.total), backgroundColor: 'rgba(5, 150, 105, 0.6)', borderColor: 'rgba(5, 150, 105, 1)', borderWidth: 1, borderRadius: 4, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, padding: 20, font: { size: 12, weight: '600' } } },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.dataset.yAxisID === 'y1') label += formatCurrency(context.raw);
                                else label += context.raw;
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { type: 'linear', display: true, position: 'left', beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: function(value) { return '₱' + (value / 1000).toFixed(0) + 'k'; } } },
                    x: { grid: { display: false } }
                }
            }
        });
        chartInstances.push(chart);
    });
}

// ============================================
// ID FINDER - SEARCH BY CUSTOMER NAME
// ============================================
async function searchCustomerByName() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const nameInput = document.getElementById('customerNameSearch').value.trim();
    const filterInput = document.getElementById('searchFilter').value.trim();
    
    if (!nameInput) {
        showFinderError('Please enter a customer name to search');
        return;
    }

    const container = document.getElementById('finderResults');
    
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Searching for: <strong>${escapeHtml(nameInput)}</strong></p>
        </div>
    `;

    try {
        let params = new URLSearchParams({
            action: 'findByName',
            customerName: nameInput
        });
        
        if (filterInput) {
            params.append('filter', filterInput);
        }
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>${escapeHtml(result.message)}</span>
                </div>
            `;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>No customers found matching "<strong>${escapeHtml(nameInput)}</strong>"</span>
                </div>
                <div class="alert alert-info" style="margin-top: 10px;">
                    <span>💡</span>
                    <span>
                        <strong>Search Tips:</strong><br>
                        • Try just the last name (e.g., "adrales")<br>
                        • Remove commas or try "adrales francisca"<br>
                        • Search is case-insensitive
                    </span>
                </div>
            `;
            return;
        }

        renderFinderResults(result.data, nameInput);

    } catch (error) {
        console.error('Search error:', error);
        container.innerHTML = `
            <div class="alert alert-error">
                <span>⚠️</span>
                <span>Failed to search. Please check your connection and try again.</span>
            </div>
        `;
    }
}

function renderFinderResults(results, searchTerm) {
    const container = document.getElementById('finderResults');
    
    const tableRows = results.map((item) => {
        const customerId = item["Customer ID"] || '';
        const customerName = item["Customer Name"] || '';
        const branch = item["Assigned Branch"] || '-';
        const officer = item["Assigned To"] || 'Unassigned';
        
        const highlightedName = customerName.replace(new RegExp(searchTerm, 'gi'), match => `<span class="highlight">${match}</span>`);
        
        return `
            <tr class="finder-row" onclick="selectCustomerFromFinder('${escapeHtml(customerId)}')" title="Click to view full details">
                <td class="col-id"><span style="font-size: 1.2rem;">🆔</span> ${escapeHtml(customerId)}</td>
                <td class="col-name">${highlightedName}</td>
                <td class="col-branch"><span>🏢</span> ${escapeHtml(branch)}</td>
                <td class="col-officer"><span>👤</span> ${escapeHtml(officer)}</td>
                <td style="text-align: center;">
                    <button class="btn-select" onclick="event.stopPropagation(); selectCustomerFromFinder('${escapeHtml(customerId)}')">Select</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="finder-results fade-in">
            <div class="finder-header">
                <div class="finder-title"><span>✅</span> Search Results</div>
                <div class="finder-stats">${results.length} unique customer(s) found</div>
            </div>
            <div class="table-container">
                <table class="finder-table">
                    <thead>
                        <tr>
                            <th class="col-id">🆔 Customer ID</th>
                            <th class="col-name">👤 Customer Name</th>
                            <th class="col-branch">🏢 Branch</th>
                            <th class="col-officer">👤 Officer</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            <div style="padding: 16px 24px; background: var(--bg-secondary); border-top: 1px solid var(--border);">
                <p style="font-size: 0.875rem; color: var(--text-muted); margin: 0;">
                    <span>💡</span> Click any row to view full transaction history for that Customer ID
                </p>
            </div>
        </div>
    `;
}

function selectCustomerFromFinder(customerId) {
    switchTab('monitoring');
    document.getElementById('customerId').value = customerId;
    searchCustomer();
}

function showFinderError(message) {
    document.getElementById('finderResults').innerHTML = `
        <div class="alert alert-error">
            <span>⚠️</span>
            <span>${message}</span>
        </div>
    `;
}

// ============================================
// BRANCH CHECKER
// ============================================
async function searchBranch() {
    if (!currentUser) {
        alert('Session expired. Please login again.');
        handleLogout();
        return;
    }
    
    const branchCode = document.getElementById('branchCode').value.trim().toUpperCase();
    
    if (!branchCode || branchCode.length !== 3) {
        showBranchError('Please enter exactly 3 letters for the branch code (e.g., AAQ)');
        return;
    }

    const container = document.getElementById('branchResults');
    
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Searching for branch: <strong>${escapeHtml(branchCode)}</strong></p>
        </div>
    `;

    try {
        if (branchChartInstance) {
            branchChartInstance.destroy();
            branchChartInstance = null;
        }

        const params = new URLSearchParams({
            action: 'getBranch',
            branchCode: branchCode
        });
        
        const response = await fetch(`${WEB_APP_URL}?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>${escapeHtml(result.message)}</span>
                </div>
            `;
            return;
        }

        if (!result.data || result.data.length === 0) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <span>⚠️</span>
                    <span>No records found for branch code "<strong>${escapeHtml(branchCode)}</strong>"</span>
                </div>
                <div class="alert alert-info" style="margin-top: 10px;">
                    <span>💡</span>
                    <span>
                        <strong>Search Tips:</strong><br>
                        • Enter exactly 3 letters (e.g., "AAQ" matches "AAQ Palawan branch")<br>
                        • Search is case-insensitive<br>
                        • Must match the first 3 characters of Column F (Assigned Branch)
                    </span>
                </div>
            `;
            currentBranchData = [];
            return;
        }

        currentBranchData = result.data;
        renderBranchResults(result.data, branchCode, result.monthlySummary);

    } catch (error) {
        console.error('Branch search error:', error);
        container.innerHTML = `
            <div class="alert alert-error">
                <span>⚠️</span>
                <span>Failed to search branch. Please check your connection and try again.</span>
            </div>
        `;
    }
}

function renderBranchResults(data, branchCode, monthlySummary) {
    const container = document.getElementById('branchResults');
    
    const totalAmount = data.reduce((sum, r) => sum + (parseFloat(r["Amount"]) || 0), 0);
    const totalTransactions = data.reduce((sum, r) => sum + (parseFloat(r["Total Transaction"]) || 0), 0);
    const uniqueBranches = [...new Set(data.map(r => r["Assigned Branch"]))];
    
    let tableRows = '';
    if (monthlySummary) {
        Object.keys(monthlySummary).sort().forEach(year => {
            monthlySummary[year].forEach((month, idx) => {
                if (month.count > 0) {
                    const monthName = new Date(year, idx).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
                    tableRows += `
                        <tr>
                            <td style="font-weight: 600;">${monthName}</td>
                            <td><span style="font-family: monospace; font-weight: 700; color: var(--primary); background: var(--bg-secondary); padding: 4px 8px; border-radius: var(--radius-sm);">${escapeHtml(branchCode)}</span></td>
                            <td style="text-align: center;"><span style="background: var(--purple); color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">${month.totalTransactions.toLocaleString()}</span></td>
                            <td style="text-align: right; font-weight: 700; color: var(--accent);">${formatCurrency(month.totalAmount)}</td>
                            <td style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">${month.count} records</td>
                        </tr>
                    `;
                }
            });
        });
    }
    
    const detailRows = data.map((record, index) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${formatDate(record["Date of Alert"])}</td>
            <td>${escapeHtml(record["Assigned Branch"])}</td>
            <td style="text-align: center; font-family: monospace;">${parseFloat(record["Total Transaction"] || 0).toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(record["Amount"])}</td>
        </tr>
    `).join('');
    
    container.innerHTML = `
        <div class="fade-in">
            <div class="stats-grid" style="margin-bottom: 30px;">
                <div class="stat-card">
                    <div class="stat-header"><span class="stat-label">Branch Code</span><span class="stat-icon">🏢</span></div>
                    <div class="stat-value" style="font-family: monospace; font-size: 2rem;">${escapeHtml(branchCode)}</div>
                    <div class="stat-subtext">${uniqueBranches.length} matching branch(es)</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-header"><span class="stat-label">Total Amount</span><span class="stat-icon">💰</span></div>
                    <div class="stat-value">${formatCurrency(totalAmount)}</div>
                    <div class="stat-subtext">Cumulative transaction value</div>
                </div>
                <div class="stat-card purple">
                    <div class="stat-header"><span class="stat-label">Total Transactions</span><span class="stat-icon">📊</span></div>
                    <div class="stat-value">${totalTransactions.toLocaleString()}</div>
                    <div class="stat-subtext">Transaction count</div>
                </div>
                <div class="stat-card info">
                    <div class="stat-header"><span class="stat-label">Data Points</span><span class="stat-icon">📋</span></div>
                    <div class="stat-value">${data.length}</div>
                    <div class="stat-subtext">Records found</div>
                </div>
            </div>

            <div class="card" style="margin-bottom: 30px;">
                <div class="card-header">
                    <div class="card-title">📅 Monthly Summary - Branch ${escapeHtml(branchCode)}</div>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr><th>Month</th><th>Branch Code</th><th style="text-align: center;">Total Transactions</th><th style="text-align: right;">Amount</th><th style="text-align: center;">Records</th></tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="chart-container">
                <div class="chart-header">
                    <div class="chart-title">📈 Monthly Comparison: Amount vs Total Transactions</div>
                    <div style="font-size: 0.875rem; color: var(--text-muted);">Branch: <strong>${escapeHtml(branchCode)}</strong></div>
                </div>
                <div class="chart-wrapper">
                    <canvas id="branchChart"></canvas>
                </div>
            </div>

            <div class="card" style="margin-bottom: 30px;">
                <div class="card-header">
                    <div class="card-title">📝 Detailed Transaction Records</div>
                    <span style="font-size: 0.9rem; color: var(--text-muted);">${data.length} entries</span>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr><th style="width: 60px; text-align: center;">#</th><th>Date of Alert</th><th>Assigned Branch</th><th style="text-align: center;">Total Transaction</th><th style="text-align: right;">Amount</th></tr>
                            </thead>
                            <tbody>${detailRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    initializeBranchChart(monthlySummary, branchCode);
}

function initializeBranchChart(monthlySummary, branchCode) {
    const ctx = document.getElementById('branchChart');
    if (!ctx || !monthlySummary) return;
    
    const labels = [];
    const amountData = [];
    const transactionData = [];
    
    Object.keys(monthlySummary).sort().forEach(year => {
        monthlySummary[year].forEach((month, idx) => {
            if (month.count > 0) {
                labels.push(new Date(year, idx).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }));
                amountData.push(month.totalAmount);
                transactionData.push(month.totalTransactions);
            }
        });
    });
    
    branchChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Amount (PHP)',
                    data: amountData,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'Total Transactions',
                    data: transactionData,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label + ': ';
                            if (context.dataset.yAxisID === 'y') label += formatCurrency(context.raw);
                            else label += context.raw.toLocaleString();
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    type: 'linear', display: true, position: 'left',
                    title: { display: true, text: 'Amount (PHP)', color: '#059669' },
                    ticks: { callback: function(value) { return '₱' + (value / 1000).toFixed(0) + 'k'; }, color: '#059669' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y1: {
                    type: 'linear', display: true, position: 'right',
                    title: { display: true, text: 'Transaction Count', color: '#7c3aed' },
                    ticks: { color: '#7c3aed' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function showBranchError(message) {
    document.getElementById('branchResults').innerHTML = `
        <div class="alert alert-error">
            <span>⚠️</span>
            <span>${message}</span>
        </div>
    `;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
function exportToExcel() {
    if (!globalData || globalData.length === 0) {
        alert('⚠️ No data available to export. Please search for a customer first.');
        return;
    }
    const ws_data = [];
    ws_data.push(['BSP Compliance Monitoring Report']);
    ws_data.push(['Generated:', new Date().toLocaleString()]);
    ws_data.push(['Generated By:', currentUser ? currentUser.username : 'Unknown']);
    ws_data.push(['Customer ID:', currentCustomer]);
    ws_data.push(['Customer Name:', globalData[0]["Customer Name"] || '']);
    ws_data.push([]);
    const headers = Object.keys(globalData[0]);
    ws_data.push(headers);
    globalData.forEach(row => ws_data.push(headers.map(h => row[h] || '')));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, "Customer Data");
    XLSX.writeFile(wb, `BSP_Monitoring_${currentCustomer}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportBranchToExcel() {
    if (!currentBranchData || currentBranchData.length === 0) {
        alert('⚠️ No branch data available to export. Please search for a branch first.');
        return;
    }
    
    const branchCode = document.getElementById('branchCode').value.trim().toUpperCase();
    const ws_data = [];
    
    ws_data.push(['Branch Analysis Report']);
    ws_data.push(['Generated:', new Date().toLocaleString()]);
    ws_data.push(['Generated By:', currentUser ? currentUser.username : 'Unknown']);
    ws_data.push(['Branch Code:', branchCode]);
    ws_data.push([]);
    ws_data.push(['Date of Alert', 'Assigned Branch', 'Total Transaction', 'Amount', 'Customer ID', 'Customer Name']);
    
    currentBranchData.forEach(row => {
        ws_data.push([
            row["Date of Alert"] || '',
            row["Assigned Branch"] || '',
            row["Total Transaction"] || 0,
            row["Amount"] || 0,
            row["Customer ID"] || '',
            row["Customer Name"] || ''
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Branch Data");
    XLSX.writeFile(wb, `Branch_Analysis_${branchCode}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ============================================
// PRINT REPORT
// ============================================
function generateReport() {
    if (!globalData || globalData.length === 0) {
        alert('⚠️ No data available. Please search for a customer first.');
        return;
    }
    const stats = calculateStats(globalData);
    const customerName = globalData[0]["Customer Name"] || "Unknown";
    document.getElementById('reportCustomerName').textContent = customerName;
    document.getElementById('reportCustomerId').textContent = currentCustomer;
    document.getElementById('reportDate').textContent = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('reportNumber').textContent = generateReportNumber();
    document.getElementById('reportTotalRecords').textContent = stats.totalRecords;
    document.getElementById('reportTotalAmount').textContent = formatCurrency(stats.totalAmount);
    document.getElementById('reportAmountAssessment').textContent = stats.totalAmount > 1000000 ? 'High Value' : 'Standard';
    document.getElementById('reportHighRisk').textContent = stats.highRisk;
    document.getElementById('reportNormal').textContent = stats.normal;
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = globalData.map((row, index) => {
        const isHigh = row["Status"]?.toLowerCase() === "high";
        const assignedTo = row["Assigned To"] || row["Assisgned to"] || '';
        return `<tr><td>${index + 1}</td><td>${formatDate(row["Date of Alert"])}</td><td>${escapeHtml(row["Transaction Type"]) || ''}</td><td>${formatCurrency(row["Amount"])}</td><td style="color: ${isHigh ? 'var(--danger)' : 'var(--success)'}; font-weight: bold;">${escapeHtml(row["Status"]) || ''}</td><td>${escapeHtml(assignedTo)}</td></tr>`;
    }).join('');
    window.print();
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    checkExistingSession();
    
    // Enter key listeners
    document.getElementById('customerId')?.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') searchCustomer(); 
    });
    document.getElementById('customerNameSearch')?.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') searchCustomerByName(); 
    });
    document.getElementById('branchCode')?.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') searchBranch(); 
    });
    document.getElementById('branchCode')?.addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });
    
    // Activity tracking for session timeout
    document.addEventListener('click', resetSessionTimer);
    document.addEventListener('keypress', resetSessionTimer);
});

function resetSessionTimer() {
    if (currentUser && sessionExpiry) {
        sessionExpiry = Date.now() + SESSION_TIMEOUT;
        sessionStorage.setItem('pgcpi_sessionExpiry', sessionExpiry);
        updateSessionDisplay();
    }
}
