const feedState = {
  originalEpisodes: [],
  episodes: [],
  image: null,
  title: '',
  description: '',
  filtered: false,
  currentXml: '',
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
const uploadResult = document.getElementById('uploadResult');
const backToEditBtn = document.getElementById('backToEditBtn');
const backToEditFooterBtn = document.getElementById('backToEditFooterBtn');

function setStatus(message, isError = false) {
  loadStatus.textContent = message;
  loadStatus.className = isError ? 'status error' : 'status success';
}

function sanitizeHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  doc.querySelectorAll('script, style').forEach((node) => node.remove());
  return doc.body.innerHTML;
}

function createCollapsibleContent(html, shouldCollapse = false) {
  const container = document.createElement('div');
  container.className = 'collapsible';

  const content = document.createElement('div');
  content.className = 'collapsible-content';
  content.innerHTML = html || '<em>No description available</em>';
  container.appendChild(content);

  if (!shouldCollapse) {
    return container;
  }

  content.classList.add('collapsed');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toggle-btn';
  toggle.textContent = 'Show more';
  toggle.addEventListener('click', () => {
    const isCollapsed = content.classList.toggle('collapsed');
    toggle.textContent = isCollapsed ? 'Show more' : 'Show less';
  });
  container.appendChild(toggle);

  return container;
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
  feedState.currentXml = '';
  podcastTitle.value = feedState.title;
  podcastDescription.value = feedState.description;
  filterTerm.value = '';
  editorSection.hidden = false;
  previewSection.hidden = true;
  renderEpisodes();
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

    const descHtml = sanitizeHtml(ep.description || '');
    const shouldCollapse = (ep.description || '').length > 240;
    const desc = createCollapsibleContent(descHtml || '<em>No description available</em>', shouldCollapse);
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
    previewSection.hidden = false;
    return;
  }

  renderReview(data.feed);
  feedState.currentXml = data.xml;
  xmlOutput.textContent = data.xml;
  xmlOutput.hidden = false;
  uploadResult.textContent = '';
  previewSection.hidden = false;
  editorSection.hidden = true;
}

async function uploadFeed() {
  const xml = feedState.currentXml;
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

function renderEpisodePreview(ep) {
  const card = document.createElement('article');
  card.className = 'review-episode';

  const titleRow = document.createElement('div');
  titleRow.className = 'review-episode__header';
  const title = document.createElement('h4');
  title.textContent = ep.title;
  const date = document.createElement('span');
  date.textContent = ep.published || 'No publish date';
  date.className = 'muted';
  titleRow.append(title, date);
  card.appendChild(titleRow);

  if (ep.image) {
    const img = document.createElement('img');
    img.src = ep.image;
    img.alt = `${ep.title} artwork`;
    img.className = 'review-episode__image';
    card.appendChild(img);
  }

  const descHtml = sanitizeHtml(ep.description || '');
  const desc = createCollapsibleContent(descHtml || '<em>No description available</em>', (ep.description || '').length > 240);
  card.appendChild(desc);

  if (ep.link) {
    const link = document.createElement('a');
    link.href = ep.link;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Episode link';
    link.className = 'review-link';
    card.appendChild(link);
  }

  return card;
}

function renderReview(feed) {
  previewContent.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'review-header';

  if (feed.image) {
    const img = document.createElement('img');
    img.src = feed.image;
    img.alt = `${feed.title} artwork`;
    img.className = 'review-image';
    header.appendChild(img);
  }

  const meta = document.createElement('div');
  meta.className = 'review-meta';
  const title = document.createElement('h3');
  title.textContent = feed.title;
  const desc = createCollapsibleContent(
    sanitizeHtml(feed.description || '') || '<em>No description available</em>',
    (feed.description || '').length > 260,
  );
  meta.appendChild(title);
  meta.appendChild(desc);
  header.appendChild(meta);
  previewContent.appendChild(header);

  const count = document.createElement('p');
  count.innerHTML = `<strong>${feed.episodes.length}</strong> episode(s) selected`;
  previewContent.appendChild(count);

  const list = document.createElement('div');
  list.className = 'review-episodes';
  feed.episodes.forEach((ep) => list.appendChild(renderEpisodePreview(ep)));
  previewContent.appendChild(list);
}

function returnToEditor() {
  previewSection.hidden = true;
  editorSection.hidden = false;
  xmlOutput.hidden = true;
  previewContent.innerHTML = '';
  uploadResult.textContent = '';
  feedState.currentXml = '';
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
backToEditBtn?.addEventListener('click', returnToEditor);
backToEditFooterBtn?.addEventListener('click', returnToEditor);
