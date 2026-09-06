const config = window.SUPABASE_CONFIG || {};
const supabaseUrl = (config.url || 'https://xwbqtqkftouhdrsypiex.supabase.co').replace(/\/+$/, '');
const anonKey = config.anonKey || 'sb_publishable_709xf2E2iMicL22GknZ0tQ_-foECAOx';
const sessionKey = 'love-nest-session';
const maxFileSize = 10 * 1024 * 1024;

const setupState = document.querySelector('#setup-state');
const authState = document.querySelector('#auth-state');
const appShell = document.querySelector('#app-shell');
const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#email-input');
const passwordInput = document.querySelector('#password-input');
const authMessage = document.querySelector('#auth-message');
const logoutButton = document.querySelector('#logout-button');
const fileInput = document.querySelector('#photo-input');
const gallery = document.querySelector('#gallery');
const emptyState = document.querySelector('#empty-state');
const clearButton = document.querySelector('#clear-button');
const status = document.querySelector('#status');
const cardTemplate = document.querySelector('#photo-card-template');

let session = readSession();

function isConfigured() {
  return Boolean(supabaseUrl && anonKey);
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || 'null');
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  session = nextSession;
  if (session) {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  } else {
    localStorage.removeItem(sessionKey);
  }
}

function createPhotoId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(message) {
  status.textContent = message;
}

function showOnly(view) {
  setupState.hidden = view !== 'setup';
  authState.hidden = view !== 'auth';
  appShell.hidden = view !== 'app';
}

function apiHeaders(extra = {}) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${session.accessToken}`,
    ...extra
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || '云端请求失败';
    throw new Error(message);
  }
  return data;
}

async function signIn(email, password) {
  const data = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  saveSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    user: data.user
  });
}

async function refreshSession() {
  if (!session?.refreshToken) return false;

  const data = await request(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: session.refreshToken })
  });

  saveSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    user: data.user
  });
  return true;
}

function encodedPath(storagePath) {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}

async function getSignedUrl(storagePath) {
  const data = await request(`${supabaseUrl}/storage/v1/object/sign/photos/${encodedPath(storagePath)}`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const signedPath = data.signedURL || data.signedUrl;
  if (signedPath.startsWith('http')) return signedPath;
  if (signedPath.startsWith('/storage/v1/')) return `${supabaseUrl}${signedPath}`;
  return `${supabaseUrl}/storage/v1${signedPath}`;
}

async function getPhotos() {
  const rows = await request(
    `${supabaseUrl}/rest/v1/photos?select=id,storage_path,caption,created_at&order=created_at.desc`,
    { headers: apiHeaders() }
  );

  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    storagePath: row.storage_path,
    caption: row.caption || '',
    createdAt: row.created_at,
    imageUrl: await getSignedUrl(row.storage_path)
  })));
}

async function uploadPhoto(file) {
  if (file.size > maxFileSize) {
    throw new Error('单张照片请控制在 10MB 以内');
  }

  const photoId = createPhotoId();
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const storagePath = `${session.user.id}/${photoId}.${extension}`;

  await request(`${supabaseUrl}/storage/v1/object/photos/${encodedPath(storagePath)}`, {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false'
    }),
    body: file
  });

  try {
    await request(`${supabaseUrl}/rest/v1/photos`, {
      method: 'POST',
      headers: apiHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify({
        user_id: session.user.id,
        storage_path: storagePath,
        caption: ''
      })
    });
  } catch (error) {
    await deleteStoredPhoto(storagePath).catch(() => {});
    throw error;
  }
}

async function deleteStoredPhoto(storagePath) {
  await request(`${supabaseUrl}/storage/v1/object/photos/${encodedPath(storagePath)}`, {
    method: 'DELETE',
    headers: apiHeaders()
  });
}

async function deletePhoto(photo) {
  await deleteStoredPhoto(photo.storagePath);
  await request(`${supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(photo.id)}`, {
    method: 'DELETE',
    headers: apiHeaders()
  });
}

async function updateCaption(photo, caption) {
  await request(`${supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(photo.id)}`, {
    method: 'PATCH',
    headers: apiHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify({ caption })
  });
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(timestamp));
}

function renderPhotos(photos) {
  gallery.querySelectorAll('.photo-card').forEach((card) => card.remove());
  emptyState.hidden = photos.length > 0;
  clearButton.hidden = photos.length === 0;

  photos.forEach((photo) => {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector('.photo');
    const date = card.querySelector('.photo-date');
    const captionInput = card.querySelector('.caption-input');
    const deleteButton = card.querySelector('.delete-button');

    image.src = photo.imageUrl;
    image.alt = photo.caption || '爱情小窝里的照片';
    date.dateTime = new Date(photo.createdAt).toISOString();
    date.textContent = formatDate(photo.createdAt);
    captionInput.value = photo.caption;

    let captionSaveTimer;
    captionInput.addEventListener('input', () => {
      clearTimeout(captionSaveTimer);
      captionSaveTimer = window.setTimeout(async () => {
        try {
          const caption = captionInput.value.trim();
          await updateCaption(photo, caption);
          image.alt = caption || '爱情小窝里的照片';
          setStatus('这一刻已经同步。');
        } catch (error) {
          setStatus(`说明保存失败：${error.message}`);
        }
      }, 350);
    });

    deleteButton.addEventListener('click', async () => {
      deleteButton.disabled = true;
      try {
        await deletePhoto(photo);
        await refreshGallery();
        setStatus('照片已从云端移除。');
      } catch (error) {
        deleteButton.disabled = false;
        setStatus(`删除失败：${error.message}`);
      }
    });

    gallery.append(card);
  });
}

async function refreshGallery() {
  const photos = await getPhotos();
  renderPhotos(photos);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = '正在登录...';

  try {
    await signIn(emailInput.value.trim(), passwordInput.value);
    passwordInput.value = '';
    showOnly('app');
    await refreshGallery();
    authMessage.textContent = '';
  } catch (error) {
    authMessage.textContent = `登录失败：${error.message}`;
  }
});

logoutButton.addEventListener('click', () => {
  saveSession(null);
  showOnly('auth');
  setStatus('');
});

fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files].filter((file) => file.type.startsWith('image/'));
  if (files.length === 0) return;

  setStatus('正在把照片同步到云端...');
  try {
    for (const file of files) await uploadPhoto(file);
    await refreshGallery();
    setStatus(`已同步 ${files.length} 张照片。`);
  } catch (error) {
    setStatus(`照片同步失败：${error.message}`);
  } finally {
    fileInput.value = '';
  }
});

clearButton.addEventListener('click', async () => {
  if (!window.confirm('确定要清空小窝里的所有云端照片吗？')) return;
  try {
    const photos = await getPhotos();
    for (const photo of photos) await deletePhoto(photo);
    await refreshGallery();
    setStatus('小窝已经清空。');
  } catch (error) {
    setStatus(`清空失败：${error.message}`);
  }
});

async function bootstrap() {
  if (session?.expiresAt && session.expiresAt <= Date.now() + 60000) {
    try {
      await refreshSession();
    } catch {
      saveSession(null);
    }
  }

  if (!session?.accessToken) {
    showOnly('auth');
    return;
  }

  showOnly('app');
  try {
    await refreshGallery();
  } catch (error) {
    saveSession(null);
    showOnly('auth');
    authMessage.textContent = `登录状态已失效：${error.message}`;
  }
}

bootstrap();
