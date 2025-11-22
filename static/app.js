const feedState = {
  originalEpisodes: [],
  episodes: [],
  image: null,
  title: '',
  description: '',
  filtered: false,
};

const feedUrlInput = document.getElementById('feedUrl');
const feedFileInput = document.getElementById('feedFile');
const loadStatus = document.getElementById('loadStatus');
const editorSection = document.getElementById('editor');
const previewSection = document.getElementById('preview');
const episodesContainer = document.getElementById('episodes');
const podcastTitle = document.getElementById('podcastTitle');
const podcastDescription = document.getElementById('podcastDescription');
const filterTerm = document.getElementById('filterTerm');
const previewContent = document.getElementById('previewContent');
const xmlOutput = document.getElementById('xmlOutput');
const uploadRow = document.getElementById('uploadRow');
const uploadResult = document.getElementById('uploadResult');

function setStatus(message, isError = false) {
  loadStatus.textContent = message;
  loadStatus.className = isError ? 'status error' : 'status success';
}

async function loadFeedFromUrl() {
  setStatus('Loading feed...');
  try {
    const response = await fetch('/api/load_feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: feedUrlInput.value }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load feed');
    }
    populateEditor(data);
    setStatus('Feed loaded');
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function loadFeedFromFile() {
  const file = feedFileInput.files[0];
  if (!file) {
    setStatus('Please choose a file', true);
    return;
  }
  setStatus('Uploading file...');
  const formData = new FormData();
  formData.append('file', file);
  try {
    const response = await fetch('/api/load_feed', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load feed');
    }
    populateEditor(data);
    setStatus('Feed loaded');
  } catch (err) {
    setStatus(err.message, true);
  }
}

function populateEditor(data) {
  feedState.originalEpisodes = data.episodes.map((ep, index) => ({ ...ep, id: index }));
  feedState.episodes = [...feedState.originalEpisodes];
  feedState.image = data.image || null;
  feedState.title = data.title || '';
  feedState.description = data.description || '';
  feedState.filterTerm = '';
  podcastTitle.value = feedState.title;
  podcastDescription.value = feedState.description;
  filterTerm.value = '';
  editorSection.hidden = false;
  previewSection.hidden = false;
  renderEpisodes();
  uploadRow.hidden = true;
  xmlOutput.hidden = true;
  previewContent.innerHTML = '';
  uploadResult.textContent = '';
}

function getVisibleEpisodes() {
  const term = feedState.filterTerm?.trim().toLowerCase();
  if (!term) return feedState.episodes;
  return feedState.episodes.filter((ep) => ep.title.toLowerCase().includes(term));
}

function renderEpisodes() {
  const list = getVisibleEpisodes();
  episodesContainer.innerHTML = '';
  list.forEach((ep) => {
    const card = document.createElement('div');
    card.className = 'episode-card';

    const header = document.createElement('div');
    header.className = 'episode-header';
    const title = document.createElement('h3');
    title.textContent = ep.title;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !ep.skip;
    checkbox.addEventListener('change', () => {
      ep.skip = !checkbox.checked;
    });
    header.appendChild(title);
    header.appendChild(checkbox);
    card.appendChild(header);

    if (ep.image) {
      const img = document.createElement('img');
      img.src = ep.image;
      img.alt = `${ep.title} artwork`;
      card.appendChild(img);
    }

    const meta = document.createElement('p');
    meta.textContent = ep.published || 'No publish date';
    meta.className = 'muted';
    card.appendChild(meta);

    const desc = document.createElement('p');
    desc.textContent = ep.description || 'No description available';
    card.appendChild(desc);

    episodesContainer.appendChild(card);
  });
}

function reverseEpisodes() {
  feedState.episodes.reverse();
  renderEpisodes();
}

function clearSelection() {
  feedState.episodes.forEach((ep) => {
    ep.skip = true;
  });
  renderEpisodes();
}

function selectAll() {
  feedState.episodes.forEach((ep) => {
    ep.skip = false;
  });
  renderEpisodes();
}

function selectFiltered() {
  const visible = getVisibleEpisodes();
  visible.forEach((ep) => {
    ep.skip = false;
  });
  renderEpisodes();
}

function applyFilter() {
  feedState.filterTerm = filterTerm.value;
  renderEpisodes();
  feedState.filtered = !!feedState.filterTerm?.trim();
}

function resetFilter() {
  filterTerm.value = '';
  feedState.filterTerm = '';
  feedState.filtered = false;
  renderEpisodes();
}

async function generatePreview() {
  const selected = feedState.episodes.filter((ep) => !ep.skip);
  const payload = {
    title: podcastTitle.value,
    description: podcastDescription.value,
    image: feedState.image,
    episodes: selected,
  };

  const response = await fetch('/api/render_feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    previewContent.textContent = data.error || 'Failed to generate feed';
    return;
  }

  previewContent.innerHTML = `
    <h3>${data.feed.title}</h3>
    <p>${data.feed.description}</p>
    <p><strong>${data.feed.episodes.length}</strong> episode(s) selected</p>
  `;
  xmlOutput.textContent = data.xml;
  xmlOutput.hidden = false;
  uploadRow.hidden = false;
  uploadResult.textContent = '';
  uploadRow.dataset.xml = data.xml;
}

async function uploadFeed() {
  const xml = uploadRow.dataset.xml;
  if (!xml) return;
  uploadResult.textContent = 'Uploading...';

  const response = await fetch('/api/upload_feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml }),
  });
  const data = await response.json();
  if (!response.ok) {
    uploadResult.textContent = data.error || 'Upload failed';
    return;
  }
  uploadResult.innerHTML = `Feed uploaded: <a href="${data.url}" target="_blank">${data.url}</a>`;
  navigator.clipboard?.writeText(data.url).catch(() => {});
}

// Event bindings
document.getElementById('loadUrlBtn').addEventListener('click', loadFeedFromUrl);
document.getElementById('loadFileBtn').addEventListener('click', loadFeedFromFile);
document.getElementById('reverseBtn').addEventListener('click', reverseEpisodes);
document.getElementById('filterBtn').addEventListener('click', applyFilter);
document.getElementById('resetFilterBtn').addEventListener('click', resetFilter);
document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
document.getElementById('selectAllBtn').addEventListener('click', selectAll);
document.getElementById('selectFilteredBtn').addEventListener('click', selectFiltered);
document.getElementById('generateBtn').addEventListener('click', generatePreview);
document.getElementById('uploadBtn').addEventListener('click', uploadFeed);
