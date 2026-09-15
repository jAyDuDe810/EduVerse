import { db, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from './firebase-config.js';

// APPLICATION STATE[cite: 1]
let websites = [];
let users = [];
let currentUser = null;
let isAdminUnlocked = false;
let currentCustomerTab = 'my-sites';
let activeViewingSiteId = null;
let isViewingMirror = false;

// 1. IMMEDIATE RENDER ON PAGE LOAD[cite: 1]
isAdminUnlocked = localStorage.getItem('eduverse_admin_unlocked') === 'true';
const savedTheme = localStorage.getItem('eduverse_theme') || 'slate';
document.body.className = `theme-${savedTheme} min-h-screen flex flex-col font-sans antialiased transition-colors duration-300`;
const themeSelector = document.getElementById('theme-selector');
if (themeSelector) themeSelector.value = savedTheme;

// 2. REAL-TIME FIRESTORE LISTENERS[cite: 1]
onSnapshot(collection(db, "websites"), (snapshot) => {
  websites = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  window.scanWebsitesForOrgBlocks();
  renderUI();
}, (error) => {
  console.warn("Firestore website sync error:", error);
});

onSnapshot(collection(db, "users"), (snapshot) => {
  users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const storedUserId = localStorage.getItem('eduverse_session_user');
  if (storedUserId) {
    currentUser = users.find(u => u.id === storedUserId) || null;
  }
  renderUI();
}, (error) => {
  console.warn("Firestore user sync error:", error);
});

// RENDER ENGINE[cite: 1]
function renderUI() {
  renderHeaderBadge();
  renderCustomerPortal();
  renderAdminPanel();
  checkOrgBlockAlerts();
}

function renderHeaderBadge() {
  const badgeContainer = document.getElementById('user-profile-badge');
  const adminBtnLabel = document.getElementById('admin-btn-label');
  const adminLockIcon = document.getElementById('admin-lock-icon');
  const adminBtn = document.getElementById('admin-mode-btn');

  if (isAdminUnlocked) {
    adminBtnLabel.textContent = 'Lock Admin';
    adminLockIcon.className = 'fa-solid fa-lock-open';
    adminBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all duration-200 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20';
  } else {
    adminBtnLabel.textContent = 'Admin Mode';
    adminLockIcon.className = 'fa-solid fa-lock';
    adminBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all duration-200 border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20';
  }

  if (currentUser) {
    badgeContainer.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs">
          ${currentUser.firstName[0]}${currentUser.lastName[0]}
        </div>
        <div class="text-left hidden md:block">
          <div class="text-xs font-bold text-white">${currentUser.firstName} ${currentUser.lastName}</div>
          <div class="text-[10px] text-slate-400">Customer</div>
        </div>
        <button onclick="window.handleSignOut()" class="text-slate-400 hover:text-red-400 text-xs p-1 ml-1" title="Sign Out">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    `;
  } else {
    badgeContainer.innerHTML = `
      <button onclick="window.openAuthModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow-md">
        <i class="fa-solid fa-user-plus mr-1"></i> Sign In / Register
      </button>
    `;
  }
}

function filterWebsites(siteList) {
  const searchVal = (document.getElementById('catalog-search-input')?.value || '').toLowerCase().trim();
  const categoryVal = document.getElementById('catalog-category-filter')?.value || 'ALL';

  return siteList.filter(site => {
    const matchesSearch = site.title.toLowerCase().includes(searchVal) || 
                          (site.description || '').toLowerCase().includes(searchVal);
    const matchesCategory = categoryVal === 'ALL' || site.category === categoryVal;
    return matchesSearch && matchesCategory;
  });
}

function renderCustomerPortal() {
  const mySitesGrid = document.getElementById('unlocked-sites-grid');
  const storeCatalogGrid = document.getElementById('store-catalog-grid');
  const identityNotice = document.getElementById('customer-identity-notice');

  renderRecentActivityLog();

  if (!currentUser) {
    identityNotice.innerHTML = `<span>Guest View</span>`;
    mySitesGrid.innerHTML = renderEmptyState('fa-user-lock', 'Authentication Required', 'Please sign in or register an account to view your unlocked websites.');
    storeCatalogGrid.innerHTML = renderStoreCards();
    return;
  }

  identityNotice.innerHTML = `<span>LoggedIn as: <strong class="text-indigo-400">${currentUser.firstName} ${currentUser.lastName}</strong></span>`;

  const approvedSiteIds = currentUser.approvedSites || [];
  const favorites = currentUser.favorites || [];
  let userApprovedWebsites = websites.filter(w => approvedSiteIds.includes(w.id));
  
  userApprovedWebsites = filterWebsites(userApprovedWebsites);
  userApprovedWebsites.sort((a, b) => (favorites.includes(b.id) ? 1 : 0) - (favorites.includes(a.id) ? 1 : 0));

  if (userApprovedWebsites.length === 0) {
    mySitesGrid.innerHTML = renderEmptyState('fa-folder-open', 'No Unlocked Websites Found', 'No unlocked websites match your search/category filters or access permissions.');
  } else {
    mySitesGrid.innerHTML = userApprovedWebsites.map(site => {
      const isFav = favorites.includes(site.id);
      const ratingData = getAverageRating(site);

      return `
        <div class="bg-slate-800 border ${site.isBlocked ? 'animate-flash-red border-red-500' : 'border-slate-700'} rounded-2xl p-6 shadow-xl flex flex-col justify-between hover:border-slate-600 transition relative">
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-indigo-400">
                <i class="fa-solid ${site.icon || 'fa-globe'} mr-1"></i> ${escapeHTML(site.category)}
              </span>
              <div class="flex items-center gap-2">
                <button onclick="window.toggleFavorite('${site.id}')" class="text-sm ${isFav ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'} transition" title="Pin Favorite">
                  <i class="fa-solid fa-star"></i>
                </button>
                ${site.isBlocked ? '<span class="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded">🚨 BLOCKED</span>' : ''}
                ${site.isMaintenance ? '<span class="text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded">🛠️ MAINTENANCE</span>' : ''}
              </div>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">${escapeHTML(site.title)}</h3>
            <div class="flex items-center gap-1 mb-2 text-xs text-amber-400">
              <i class="fa-solid fa-star"></i>
              <span class="font-bold text-slate-200">${ratingData.avg}</span>
              <span class="text-slate-500">(${ratingData.count} ratings)</span>
            </div>
            <p class="text-xs text-slate-400 leading-relaxed mb-4">${escapeHTML(site.description || 'Interactive educational web tool.')}</p>
          </div>
          ${site.isMaintenance ? 
            `<button disabled class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold text-xs py-2.5 rounded-xl cursor-not-allowed">Temporarily Under Maintenance</button>` :
            `<button onclick="window.launchWebsiteViewer('${site.id}')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 rounded-xl transition shadow-lg flex items-center justify-center gap-2">
              <i class="fa-solid fa-circle-play"></i> Launch Workspace
            </button>`
          }
        </div>
      `;
    }).join('');
  }

  storeCatalogGrid.innerHTML = renderStoreCards();
}

function renderStoreCards() {
  let filteredSites = filterWebsites(websites);

  if (filteredSites.length === 0) {
    return renderEmptyState('fa-store-slash', 'No Websites Found', 'No educational websites match your current search criteria.');
  }

  return filteredSites.map(site => {
    let buttonHTML = '';
    const ratingData = getAverageRating(site);

    if (!currentUser) {
      buttonHTML = `<button onclick="window.openAuthModal()" class="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs py-2.5 rounded-xl transition">Sign In to Request</button>`;
    } else {
      const isApproved = (currentUser.approvedSites || []).includes(site.id);
      const isPending = (currentUser.pendingRequests || []).includes(site.id);

      if (isApproved) {
        buttonHTML = `<button onclick="window.launchWebsiteViewer('${site.id}')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2"><i class="fa-solid fa-circle-check"></i> Unlocked - Launch</button>`;
      } else if (isPending) {
        buttonHTML = `<button disabled class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold text-xs py-2.5 rounded-xl cursor-not-allowed">⏳ Pending Approval</button>`;
      } else {
        buttonHTML = `<button onclick="window.requestSiteAccess('${site.id}')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2"><i class="fa-solid fa-paper-plane"></i> Request Access</button>`;
      }
    }

    return `
      <div class="bg-slate-800 border ${site.isBlocked ? 'animate-flash-red border-red-500' : 'border-slate-700'} rounded-2xl p-6 shadow-xl flex flex-col justify-between hover:border-slate-600 transition">
        <div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-indigo-400">
              <i class="fa-solid ${site.icon || 'fa-globe'} mr-1"></i> ${escapeHTML(site.category)}
            </span>
            <div class="flex items-center gap-1">
              ${site.isBlocked ? '<span class="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded">🚨 NETWORK BLOCKED</span>' : ''}
              ${site.isMaintenance ? '<span class="text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded">🛠️ MAINTENANCE</span>' : ''}
            </div>
          </div>
          <h3 class="text-lg font-bold text-white mb-1">${escapeHTML(site.title)}</h3>
          <div class="flex items-center gap-1 mb-2 text-xs text-amber-400">
            <i class="fa-solid fa-star"></i>
            <span class="font-bold text-slate-200">${ratingData.avg}</span>
            <span class="text-slate-500">(${ratingData.count} ratings)</span>
          </div>
          <p class="text-xs text-slate-400 leading-relaxed mb-4">${escapeHTML(site.description || 'Interactive educational web portal.')}</p>
        </div>
        ${buttonHTML}
      </div>
    `;
  }).join('');
}

function renderAdminPanel() {
  const adminPanelSection = document.getElementById('admin-panel');
  const customerPortalSection = document.getElementById('customer-portal');

  if (!isAdminUnlocked) {
    adminPanelSection.classList.add('hidden');
    customerPortalSection.classList.remove('hidden');
    return;
  }

  adminPanelSection.classList.remove('hidden');

  const totalLaunches = websites.reduce((acc, curr) => acc + (curr.launchCount || 0), 0);
  const pendingCount = users.reduce((acc, curr) => acc + (curr.pendingRequests || []).length, 0);
  document.getElementById('admin-analytics-summary').innerHTML = `
    <div class="bg-slate-900/80 p-3 rounded-xl border border-amber-500/20 text-center">
      <div class="text-lg font-extrabold text-amber-400">${websites.length}</div>
      <div class="text-[10px] text-slate-400 uppercase font-semibold">Total Sites</div>
    </div>
    <div class="bg-slate-900/80 p-3 rounded-xl border border-amber-500/20 text-center">
      <div class="text-lg font-extrabold text-amber-400">${users.length}</div>
      <div class="text-[10px] text-slate-400 uppercase font-semibold">Customers</div>
    </div>
    <div class="bg-slate-900/80 p-3 rounded-xl border border-amber-500/20 text-center">
      <div class="text-lg font-extrabold text-amber-400">${pendingCount}</div>
      <div class="text-[10px] text-slate-400 uppercase font-semibold">Pending Requests</div>
    </div>
    <div class="bg-slate-900/80 p-3 rounded-xl border border-amber-500/20 text-center">
      <div class="text-lg font-extrabold text-amber-400">${totalLaunches}</div>
      <div class="text-[10px] text-slate-400 uppercase font-semibold">Total App Launches</div>
    </div>
  `;
  
  const adminCatalog = document.getElementById('admin-catalog-list');
  if (websites.length === 0) {
    adminCatalog.innerHTML = renderEmptyState('fa-cloud-arrow-up', 'No Websites Added', 'Use the form above to publish your first educational website to the store.');
  } else {
    adminCatalog.innerHTML = websites.map(site => `
      <div class="bg-slate-900 border ${site.isBlocked ? 'animate-flash-red border-red-500' : 'border-slate-700'} rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] bg-slate-800 text-indigo-400 px-2 py-0.5 rounded font-semibold border border-slate-700">
              ${escapeHTML(site.category)}
            </span>
            <div class="flex items-center gap-1">
              ${site.isBlocked ? '<span class="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">BLOCKED</span>' : ''}
              ${site.isMaintenance ? '<span class="text-[10px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded">MAINTENANCE</span>' : ''}
            </div>
          </div>
          <h4 class="font-bold text-white text-sm mb-1">${escapeHTML(site.title)}</h4>
          <p class="text-xs text-slate-400 truncate" title="${escapeHTML(site.url)}"><i class="fa-solid fa-link text-[10px] mr-1"></i> ${escapeHTML(site.url)}</p>
          ${site.mirrorUrl ? `<p class="text-[10px] text-emerald-400 truncate" title="${escapeHTML(site.mirrorUrl)}"><i class="fa-solid fa-clone mr-1"></i> Mirror: ${escapeHTML(site.mirrorUrl)}</p>` : ''}
          <div class="text-[10px] text-slate-500 mt-2"><i class="fa-solid fa-eye mr-1"></i> ${site.launchCount || 0} Launches</div>
        </div>

        <div class="flex items-center justify-between pt-3 mt-3 border-t border-slate-800">
          <button onclick="window.openEditSiteModal('${site.id}')" class="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1">
            <i class="fa-solid fa-pen-to-square"></i> Edit URL / Details
          </button>
          <div class="flex items-center gap-3">
            <button onclick="window.testSitePing('${site.id}')" class="text-xs text-indigo-400 hover:underline">Ping</button>
            <button onclick="window.deleteWebsite('${site.id}')" class="text-xs text-red-400 hover:text-red-300 font-semibold"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  }

  const adminPermissions = document.getElementById('admin-customers-permissions');
  if (users.length === 0) {
    adminPermissions.innerHTML = renderEmptyState('fa-users-slash', 'No Registered Customers', 'When customers sign up on your website, they will appear here.');
  } else {
    adminPermissions.innerHTML = users.map(user => {
      const userApproved = user.approvedSites || [];
      const userPending = user.pendingRequests || [];

      return `
        <div class="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold rounded-lg flex items-center justify-center">
                ${user.firstName[0]}${user.lastName[0]}
              </div>
              <div>
                <h4 class="font-bold text-white text-sm">${user.firstName} ${user.lastName}</h4>
                <p class="text-xs text-slate-400">Username: <span class="text-indigo-300">${user.username}</span></p>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <button onclick="window.approveAllPending('${user.id}')" class="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 px-2.5 py-1 rounded-lg font-semibold transition">
                <i class="fa-solid fa-check-double mr-1"></i> Approve Pending (${userPending.length})
              </button>
              <button onclick="window.grantAllSites('${user.id}')" class="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 px-2.5 py-1 rounded-lg font-semibold transition">
                <i class="fa-solid fa-unlock mr-1"></i> Grant All Sites
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Access Rights:</p>
            ${websites.length === 0 ? '<p class="text-xs text-slate-500 italic">No websites in store to grant.</p>' : 
              websites.map(site => {
                const isGranted = userApproved.includes(site.id);
                const isReq = userPending.includes(site.id);

                return `
                  <div class="flex items-center justify-between bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                    <div class="flex items-center space-x-2">
                      <input type="checkbox" id="perm-${user.id}-${site.id}" ${isGranted ? 'checked' : ''} onchange="window.toggleUserAccess('${user.id}', '${site.id}')" class="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500">
                      <label for="perm-${user.id}-${site.id}" class="text-xs font-medium text-slate-200 cursor-pointer">${escapeHTML(site.title)}</label>
                    </div>
                    ${isReq ? '<span class="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-bold animate-pulse">REQUESTED</span>' : ''}
                  </div>
                `;
              }).join('')
            }
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderRecentActivityLog() {
  const recentSection = document.getElementById('recent-activity-section');
  const recentGrid = document.getElementById('recent-launches-grid');
  
  const rawLog = localStorage.getItem('eduverse_recent_launches');
  if (!rawLog) {
    recentSection.classList.add('hidden');
    return;
  }

  const recentIds = JSON.parse(rawLog);
  const recentSites = recentIds.map(id => websites.find(w => w.id === id)).filter(Boolean);

  if (recentSites.length === 0) {
    recentSection.classList.add('hidden');
    return;
  }

  recentSection.classList.remove('hidden');
  recentGrid.innerHTML = recentSites.map(site => `
    <button onclick="window.launchWebsiteViewer('${site.id}')" class="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-left flex items-center space-x-2.5 flex-shrink-0 transition">
      <i class="fa-solid ${site.icon || 'fa-globe'} text-indigo-400 text-sm"></i>
      <div>
        <div class="text-xs font-bold text-white max-w-[120px] truncate">${escapeHTML(site.title)}</div>
        <div class="text-[10px] text-slate-400">${escapeHTML(site.category)}</div>
      </div>
    </button>
  `).join('');
}

function getAverageRating(site) {
  if (!site.ratings || site.ratings.length === 0) return { avg: 'N/A', count: 0 };
  const sum = site.ratings.reduce((acc, r) => acc + r.rating, 0);
  return {
    avg: (sum / site.ratings.length).toFixed(1),
    count: site.ratings.length
  };
}

function renderEmptyState(icon, title, desc) {
  return `
    <div class="col-span-full bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl p-8 text-center my-4">
      <i class="fa-solid ${icon} text-3xl text-slate-500 mb-3"></i>
      <h4 class="text-base font-bold text-slate-300 mb-1">${title}</h4>
      <p class="text-xs text-slate-400 max-w-sm mx-auto">${desc}</p>
    </div>
  `;
}

// GLOBAL WINDOW HANDLERS[cite: 1]
window.handleThemeChange = function(themeName) {
  document.body.className = `theme-${themeName} min-h-screen flex flex-col font-sans antialiased transition-colors duration-300`;
  localStorage.setItem('eduverse_theme', themeName);
};

window.handleSearchFilterChange = function() {
  renderCustomerPortal();
};

window.scanWebsitesForOrgBlocks = async function() {
  for (let i = 0; i < websites.length; i++) {
    const site = websites[i];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      await fetch(site.url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      site.isBlocked = false;
    } catch (err) {
      site.isBlocked = true;
    }
  }
  renderUI();
};

function checkOrgBlockAlerts() {
  const banner = document.getElementById('org-block-alert-banner');
  const countText = document.getElementById('blocked-sites-count-text');
  
  const blockedCount = websites.filter(w => w.isBlocked).length;
  if (isAdminUnlocked && blockedCount > 0) {
    banner.classList.remove('hidden');
    countText.textContent = `${blockedCount} website(s) in your catalog appear to be BLOCKED or unreachable by the current network firewall.`;
  } else {
    banner.classList.add('hidden');
  }
}

window.testSitePing = async function(siteId) {
  alert(`Testing connection to site...`);
  await window.scanWebsitesForOrgBlocks();
  const site = websites.find(w => w.id === siteId);
  alert(`Ping Scan Finished. Status: ${site?.isBlocked ? 'BLOCKED/UNREACHABLE' : 'REACHABLE'}`);
};

window.openEditSiteModal = function(siteId) {
  const site = websites.find(w => w.id === siteId);
  if (!site) return;

  document.getElementById('edit-site-id').value = site.id;
  document.getElementById('edit-site-title').value = site.title;
  document.getElementById('edit-site-url').value = site.url;
  document.getElementById('edit-site-mirror-url').value = site.mirrorUrl || '';
  document.getElementById('edit-site-category').value = site.category;
  document.getElementById('edit-site-icon').value = site.icon || 'fa-globe';
  document.getElementById('edit-site-desc').value = site.description || '';
  document.getElementById('edit-site-maintenance').checked = !!site.isMaintenance;

  document.getElementById('edit-site-modal').classList.remove('hidden');
};

window.closeEditSiteModal = function() {
  document.getElementById('edit-site-modal').classList.add('hidden');
};

window.handleEditSiteSubmit = async function(e) {
  e.preventDefault();
  const siteId = document.getElementById('edit-site-id').value;
  const title = document.getElementById('edit-site-title').value.trim();
  let url = document.getElementById('edit-site-url').value.trim();
  let mirrorUrl = document.getElementById('edit-site-mirror-url').value.trim();
  const category = document.getElementById('edit-site-category').value;
  const icon = document.getElementById('edit-site-icon').value.trim() || 'fa-globe';
  const description = document.getElementById('edit-site-desc').value.trim();
  const isMaintenance = document.getElementById('edit-site-maintenance').checked;

  if (!siteId || !title || !url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  if (mirrorUrl && !mirrorUrl.startsWith('http://') && !mirrorUrl.startsWith('https://')) mirrorUrl = 'https://' + mirrorUrl;

  await updateDoc(doc(db, "websites", siteId), {
    title, url, mirrorUrl, category, icon, description, isMaintenance
  });

  window.closeEditSiteModal();
};

window.toggleFavorite = async function(siteId) {
  if (!currentUser) return;
  let favorites = currentUser.favorites || [];
  
  if (favorites.includes(siteId)) {
    favorites = favorites.filter(id => id !== siteId);
  } else {
    favorites.push(siteId);
  }

  currentUser.favorites = favorites;
  await updateDoc(doc(db, "users", currentUser.id), { favorites });
};

window.approveAllPending = async function(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  const approved = Array.from(new Set([...(user.approvedSites || []), ...(user.pendingRequests || [])]));
  await updateDoc(doc(db, "users", userId), { approvedSites: approved, pendingRequests: [] });
};

window.grantAllSites = async function(userId) {
  const allSiteIds = websites.map(w => w.id);
  await updateDoc(doc(db, "users", userId), { approvedSites: allSiteIds, pendingRequests: [] });
};

window.openAuthModal = function() {
  document.getElementById('auth-modal').classList.remove('hidden');
};

window.closeAuthModal = function() {
  document.getElementById('auth-modal').classList.add('hidden');
};

window.handleAuthSubmit = async function(e) {
  e.preventDefault();
  const fn = document.getElementById('auth-firstname').value.trim();
  const ln = document.getElementById('auth-lastname').value.trim();
  const pass = document.getElementById('auth-password').value.trim();

  if (!fn || !ln || !pass) return;

  const username = `${fn} ${ln}`;
  let existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (existingUser) {
    if (existingUser.password !== pass) {
      alert("Incorrect password for existing account.");
      return;
    }
    currentUser = existingUser;
  } else {
    const userId = 'user_' + Date.now();
    const newUser = {
      id: userId,
      firstName: fn,
      lastName: ln,
      username: username,
      password: pass,
      approvedSites: [],
      pendingRequests: [],
      favorites: []
    };
    await setDoc(doc(db, "users", userId), newUser);
    currentUser = newUser;
  }

  localStorage.setItem('eduverse_session_user', currentUser.id);
  window.closeAuthModal();
  renderUI();
};

window.handleSignOut = function() {
  currentUser = null;
  localStorage.removeItem('eduverse_session_user');
  renderUI();
};

window.handleAdminToggle = function() {
  if (isAdminUnlocked) {
    isAdminUnlocked = false;
    localStorage.setItem('eduverse_admin_unlocked', 'false');
    renderUI();
  } else {
    document.getElementById('admin-pass-input').value = '';
    document.getElementById('admin-pass-error').classList.add('hidden');
    document.getElementById('admin-pass-modal').classList.remove('hidden');
  }
};

window.closeAdminModal = function() {
  document.getElementById('admin-pass-modal').classList.add('hidden');
};

window.verifyAdminPassword = function(e) {
  e.preventDefault();
  const pass = document.getElementById('admin-pass-input').value.trim();
  
  if (pass === 'mkrocks') {
    isAdminUnlocked = true;
    localStorage.setItem('eduverse_admin_unlocked', 'true');
    window.closeAdminModal();
    renderUI();
  } else {
    document.getElementById('admin-pass-error').classList.remove('hidden');
  }
};

window.handleAddWebsite = async function(e) {
  e.preventDefault();
  const title = document.getElementById('site-title').value.trim();
  let url = document.getElementById('site-url').value.trim();
  let mirrorUrl = document.getElementById('site-mirror-url').value.trim();
  const category = document.getElementById('site-category').value;
  const icon = document.getElementById('site-icon').value.trim() || 'fa-globe';
  const description = document.getElementById('site-desc').value.trim();

  if (!title || !url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  if (mirrorUrl && !mirrorUrl.startsWith('http://') && !mirrorUrl.startsWith('https://')) mirrorUrl = 'https://' + mirrorUrl;

  const siteId = 'site_' + Date.now();
  const newSite = {
    id: siteId, title, url, mirrorUrl, category, icon, description,
    isBlocked: false, isMaintenance: false, launchCount: 0, ratings: []
  };

  await setDoc(doc(db, "websites", siteId), newSite);

  document.getElementById('site-title').value = '';
  document.getElementById('site-url').value = '';
  document.getElementById('site-mirror-url').value = '';
  document.getElementById('site-desc').value = '';
};

window.deleteWebsite = async function(siteId) {
  if (!confirm("Are you sure you want to remove this website from Firebase?")) return;

  await deleteDoc(doc(db, "websites", siteId));

  for (const u of users) {
    const approved = (u.approvedSites || []).filter(id => id !== siteId);
    const pending = (u.pendingRequests || []).filter(id => id !== siteId);
    await setDoc(doc(db, "users", u.id), { ...u, approvedSites: approved, pendingRequests: pending });
  }
};

window.requestSiteAccess = async function(siteId) {
  if (!currentUser) {
    window.openAuthModal();
    return;
  }

  const pending = currentUser.pendingRequests || [];
  if (!pending.includes(siteId)) {
    pending.push(siteId);
    await setDoc(doc(db, "users", currentUser.id), { ...currentUser, pendingRequests: pending });
    alert("Access requested! The seller will review your request shortly.");
  }
};

window.toggleUserAccess = async function(userId, siteId) {
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return;

  let approved = targetUser.approvedSites || [];
  let pending = targetUser.pendingRequests || [];

  const appIdx = approved.indexOf(siteId);
  if (appIdx > -1) {
    approved = approved.filter(id => id !== siteId);
  } else {
    approved.push(siteId);
    pending = pending.filter(id => id !== siteId);
  }

  await setDoc(doc(db, "users", userId), { ...targetUser, approvedSites: approved, pendingRequests: pending });
};

window.switchCustomerTab = function(tab) {
  currentCustomerTab = tab;
  const mySitesView = document.getElementById('view-my-sites');
  const storeCatalogView = document.getElementById('view-store-catalog');
  const tabMySites = document.getElementById('tab-my-sites');
  const tabStore = document.getElementById('tab-store-catalog');

  if (tab === 'my-sites') {
    mySitesView.classList.remove('hidden');
    storeCatalogView.classList.add('hidden');
    tabMySites.className = 'px-4 py-2 rounded-xl text-sm font-semibold transition bg-indigo-600 text-white shadow-md';
    tabStore.className = 'px-4 py-2 rounded-xl text-sm font-semibold transition bg-slate-800 text-slate-400 hover:text-white';
  } else {
    mySitesView.classList.add('hidden');
    storeCatalogView.classList.remove('hidden');
    tabStore.className = 'px-4 py-2 rounded-xl text-sm font-semibold transition bg-indigo-600 text-white shadow-md';
    tabMySites.className = 'px-4 py-2 rounded-xl text-sm font-semibold transition bg-slate-800 text-slate-400 hover:text-white';
  }
};

window.launchWebsiteViewer = async function(siteId, forceMirror = false) {
  const site = websites.find(w => w.id === siteId);
  if (!site) return;

  if (site.isMaintenance) {
    alert("This website is currently under maintenance by the administrator.");
    return;
  }

  activeViewingSiteId = siteId;
  isViewingMirror = forceMirror;

  const modal = document.getElementById('iframe-viewer-modal');
  const iframe = document.getElementById('main-iframe');
  const loader = document.getElementById('iframe-loader');
  const mirrorBtn = document.getElementById('viewer-mirror-btn');
  const sourceBadge = document.getElementById('viewer-active-source-badge');

  document.getElementById('viewer-title').textContent = site.title;
  document.getElementById('viewer-category').textContent = site.category;
  document.getElementById('viewer-icon').className = `fa-solid ${site.icon || 'fa-globe'}`;

  if (site.mirrorUrl) {
    mirrorBtn.classList.remove('hidden');
  } else {
    mirrorBtn.classList.add('hidden');
  }

  const targetUrl = (forceMirror && site.mirrorUrl) ? site.mirrorUrl : site.url;
  sourceBadge.textContent = (forceMirror && site.mirrorUrl) ? 'Backup Mirror Server' : 'Main Server';
  sourceBadge.className = (forceMirror && site.mirrorUrl) ? 'text-[10px] bg-slate-800 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold' : 'text-[10px] bg-slate-800 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold';

  loader.classList.remove('hidden');
  iframe.src = targetUrl;

  iframe.onload = () => { loader.classList.add('hidden'); };
  modal.classList.remove('hidden');

  const currentLaunches = site.launchCount || 0;
  await updateDoc(doc(db, "websites", siteId), { launchCount: currentLaunches + 1 });

  let recentLog = JSON.parse(localStorage.getItem('eduverse_recent_launches') || '[]');
  recentLog = [siteId, ...recentLog.filter(id => id !== siteId)].slice(0, 5);
  localStorage.setItem('eduverse_recent_launches', JSON.stringify(recentLog));
  renderRecentActivityLog();
};

window.toggleViewerMirrorSource = function() {
  if (!activeViewingSiteId) return;
  window.launchWebsiteViewer(activeViewingSiteId, !isViewingMirror);
};

window.submitSiteRating = async function(score) {
  if (!activeViewingSiteId) return;
  const site = websites.find(w => w.id === activeViewingSiteId);
  if (!site) return;

  const ratings = site.ratings || [];
  const userIdentifier = currentUser ? currentUser.id : 'guest_' + Date.now();

  const cleanRatings = ratings.filter(r => r.userId !== userIdentifier);
  cleanRatings.push({ userId: userIdentifier, rating: score, timestamp: Date.now() });

  await updateDoc(doc(db, "websites", activeViewingSiteId), { ratings: cleanRatings });
  alert(`Thank you! You rated ${site.title} ${score} star(s).`);
};

window.closeIframeViewer = function() {
  const modal = document.getElementById('iframe-viewer-modal');
  const iframe = document.getElementById('main-iframe');
  iframe.src = 'about:blank';
  modal.classList.add('hidden');
  activeViewingSiteId = null;
  isViewingMirror = false;
};

window.toggleFullscreen = function() {
  const modal = document.getElementById('iframe-viewer-modal');
  if (!document.fullscreenElement) {
    modal.requestFullscreen().catch(err => alert(`Fullscreen error: ${err.message}`));
  } else {
    document.exitFullscreen();
  }
};

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}