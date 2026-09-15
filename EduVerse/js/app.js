import { db, collection, doc, setDoc } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
  const getStartedBtn = document.getElementById('get-started-btn');
  const courseList = document.getElementById('course-list');
  const scanBtn = document.getElementById('btn-run-scan');
  const searchQueryInput = document.getElementById('yt-search-query');
  const apiKeyInput = document.getElementById('yt-api-key');
  const scanStatus = document.getElementById('scan-status');
  const scanResultsContainer = document.getElementById('scan-results');

  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
      alert('Welcome to EduVerse! Select a course or scan links below.');
    });
  }

  // Load sample course catalog
  const sampleCourses = [
    { title: 'Intro to Web Development', category: 'Coding' },
    { title: 'Data Science Fundamentals', category: 'Analytics' },
    { title: 'UI/UX Design Essentials', category: 'Design' }
  ];

  if (courseList) {
    courseList.innerHTML = sampleCourses.map(course => `
      <div class="course-card">
        <h3>${course.title}</h3>
        <p>Category: ${course.category}</p>
        <button style="margin-top: 0.5rem;">Explore</button>
      </div>
    `).join('');
  }

  // YouTube Scanner Event Listener
  if (scanBtn) {
    scanBtn.addEventListener('click', () => {
      const query = searchQueryInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      if (!query) return alert("Please enter a search query!");
      runYouTubeScanner(query, apiKey);
    });
  }

  // Scanner Logic: YouTube Search + Link Parsing
  async function runYouTubeScanner(query, apiKey) {
    scanStatus.innerText = "Searching YouTube...";
    scanResultsContainer.innerHTML = "";

    try {
      let extractedLinks = [];

      if (apiKey) {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${apiKey}`);
        const data = await response.json();
        
        data.items?.forEach(item => {
          const desc = item.snippet.description;
          const urls = extractUrlsFromText(desc);
          urls.forEach(url => extractedLinks.push({ title: item.snippet.title, url }));
        });
      } else {
        scanStatus.innerText = "Scanning demo source links (No API Key provided)...";
        extractedLinks = [
          { title: "Demo Learning Site 1", url: "https://example.com/demo1" },
          { title: "Demo Math Tool Site", url: "https://example.com/demo2" }
        ];
      }

      if (extractedLinks.length === 0) {
        scanStatus.innerText = "No web links found in search descriptions.";
        return;
      }

      scanStatus.innerText = `Testing network reachability for ${extractedLinks.length} found links...`;
      for (const item of extractedLinks) {
        const isReachable = await checkNetworkPing(item.url);
        renderScannedCard(item.title, item.url, isReachable);
      }
      
      scanStatus.innerText = "Scan complete!";
    } catch (error) {
      console.error("Scanner error:", error);
      scanStatus.innerText = "Error scanning YouTube. Check browser console.";
    }
  }

  function extractUrlsFromText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  }

  // Reachability Ping Checker
  async function checkNetworkPing(targetUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      await fetch(targetUrl, { mode: 'no-cors', method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      return true;
    } catch (err) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  // Render Scanned Card & Connect Firebase Write Action
  function renderScannedCard(title, url, isReachable) {
    const card = document.createElement('div');
    card.className = `scanned-card ${isReachable ? 'reachable' : 'blocked'}`;
    
    const siteId = "site_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    card.innerHTML = `
      <div>
        <h3>${title}</h3>
        <p style="font-size: 0.8rem; word-break: break-all; color: #666;">${url}</p>
        <span class="${isReachable ? 'badge-online' : 'badge-blocked'}">
          ${isReachable ? '● Reachable' : '▲ Network Blocked'}
        </span>
      </div>
      <div style="margin-top: 1rem;">
        <button class="btn-add-firebase btn" ${!isReachable ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
          Add to Firebase Catalog
        </button>
      </div>
    `;

    const addBtn = card.querySelector('.btn-add-firebase');
    if (addBtn && isReachable) {
      addBtn.addEventListener('click', async () => {
        try {
          await setDoc(doc(db, "websites", siteId), {
            id: siteId,
            title: title,
            url: url,
            category: "Scanned Links",
            isBlocked: false,
            createdAt: new Date().toISOString()
          });
          alert(`Successfully added "${title}" to Firestore!`);
          addBtn.innerText = "Added!";
          addBtn.disabled = true;
        } catch (err) {
          console.error("Firebase write error:", err);
          alert("Failed to save to Firestore.");
        }
      });
    }

    scanResultsContainer.appendChild(card);
  }
});
