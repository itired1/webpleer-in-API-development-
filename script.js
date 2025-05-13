const config = {
    theme: 'dark',
    opacity: 89,
    particlesEnabled: true,
    backgroundImage: '',
    apiKeys: {
        soundcloud: '',
        vk: ''
    },
    currentTrack: null,
    audio: new Audio(),
    currentSource: 'soundcloud',
    volume: 80,
    history: [],
    favorites: []
};

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    initUI();
    initParticles();
    initEventListeners();
    
    // Проверяем ключи при загрузке
    if (config.apiKeys.soundcloud) {
        checkSoundCloudKey();
    }
    
    // Восстанавливаем громкость
    config.audio.volume = config.volume / 100;
});

// Проверка ключа SoundCloud
async function checkSoundCloudKey() {
    try {
        const response = await fetch(`https://api.soundcloud.com/tracks?q=test&client_id=${config.apiKeys.soundcloud}`);
        if (!response.ok) throw new Error('Неверный ключ');
        console.log('SoundCloud API работает!');
        return true;
    } catch (error) {
        console.error('SoundCloud error:', error);
        showAlert('Ошибка SoundCloud: ' + error.message, 'error');
        return false;
    }
}

async function searchSoundCloud(query) {
    if (!config.apiKeys.soundcloud) {
        showAlert('Введите SoundCloud ключ в настройках', 'warning');
        openSettings('api');
        return;
    }

    try {
        showLoader();
        const response = await fetch(
            `https://api.soundcloud.com/tracks?q=${encodeURIComponent(query)}&client_id=${config.apiKeys.soundcloud}`
        );
        const data = await response.json();
        hideLoader();
        
        if (data.errors) {
            throw new Error(data.errors[0].error_message);
        }
        
        displayTracks(data);
    } catch (error) {
        console.error('SoundCloud error:', error);
        hideLoader();
        showAlert('Ошибка поиска: ' + error.message, 'error');
    }
}

async function searchVK(query) {
    if (!config.apiKeys.vk) {
        showAlert('Введите VK токен в настройках', 'warning');
        openSettings('api');
        return;
    }

    try {
        showLoader();
        
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const apiUrl = `https://api.vk.com/method/audio.search?q=${encodeURIComponent(query)}&access_token=${config.apiKeys.vk}&v=5.131&count=50`;
        
        const response = await fetch(proxyUrl + apiUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        const data = await response.json();
        hideLoader();
        
        if (data.error) {
            throw new Error(data.error.error_msg);
        }
        
        const tracks = data.response.items.map(track => ({
            id: track.id,
            title: track.title,
            user: {
                username: track.artist
            },
            duration: track.duration * 1000,
            url: track.url,
            artwork_url: track.album ? track.album.thumb : null
        }));
        
        displayTracks(tracks);
    } catch (error) {
        console.error('VK error:', error);
        hideLoader();
        showAlert('Ошибка VK: ' + error.message, 'error');
    }
}

function playTrack(track) {
    try {
        config.currentTrack = track;
        
        if (!config.history.some(t => t.id === track.id)) {
            config.history.unshift(track);
            if (config.history.length > 50) config.history.pop();
            saveConfig();
        }
        
        document.getElementById('now-playing').textContent = 
            `${track.title || 'Без названия'} - ${track.user ? track.user.username : 'Неизвестный артист'}`;
        
        // Для SoundCloud
        if (track.stream_url) {
            config.audio.src = `${track.stream_url}?client_id=${config.apiKeys.soundcloud}`;
        } 
        // Для VK
        else if (track.url) {
            config.audio.src = track.url;
        }
        
        config.audio.play()
            .then(() => {
                document.getElementById('play-pause').innerHTML = '<i class="fas fa-pause"></i>';
            })
            .catch(error => {
                console.error('Playback error:', error);
                showAlert('Ошибка воспроизведения: ' + error.message, 'error');
            });
    } catch (error) {
        console.error('Play track error:', error);
        showAlert('Ошибка воспроизведения', 'error');
    }
}

function searchTracks() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
        showAlert('Введите поисковый запрос', 'warning');
        return;
    }

    if (config.currentSource === 'vk') {
        searchVK(query);
    } else {
        searchSoundCloud(query);
    }
}

function displayTracks(tracks) {
    const trackList = document.getElementById('track-list');
    trackList.innerHTML = '';

    if (!tracks || tracks.length === 0) {
        trackList.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>Ничего не найдено</p>
            </div>
        `;
        return;
    }

    tracks.slice(0, 50).forEach((track, index) => {
        const trackEl = document.createElement('div');
        trackEl.className = 'track';
        trackEl.innerHTML = `
            <div class="track-number">${index + 1}</div>
            <div class="track-info">
                <div class="track-title">${track.title || 'Без названия'}</div>
                <div class="track-artist">${track.user ? track.user.username : 'Неизвестный артист'}</div>
            </div>
            <div class="track-duration">${formatDuration(track.duration)}</div>
        `;
        trackEl.addEventListener('click', () => playTrack(track));
        trackList.appendChild(trackEl);
    });
}

function formatDuration(ms) {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function togglePlayPause() {
    if (config.audio.paused) {
        config.audio.play()
            .then(() => {
                document.getElementById('play-pause').innerHTML = '<i class="fas fa-pause"></i>';
            });
    } else {
        config.audio.pause();
        document.getElementById('play-pause').innerHTML = '<i class="fas fa-play"></i>';
    }
}

function prevTrack() {
    if (config.history.length > 1) {
        const prevTrack = config.history[1];
        playTrack(prevTrack);
    } else {
        showAlert('Нет предыдущих треков', 'info');
    }
}

function nextTrack() {
    if (config.history.length > 1) {
        const randomIndex = Math.floor(Math.random() * (config.history.length - 1)) + 1;
        playTrack(config.history[randomIndex]);
    } else {
        showAlert('Нет следующих треков', 'info');
    }
}

function updateProgress() {
    const progress = document.getElementById('progress');
    const currentTime = document.getElementById('current-time');
    const duration = document.getElementById('duration');
    
    if (config.audio.duration) {
        const percent = (config.audio.currentTime / config.audio.duration) * 100;
        progress.style.width = `${percent}%`;
        currentTime.textContent = formatDuration(config.audio.currentTime * 1000);
        duration.textContent = formatDuration(config.audio.duration * 1000);
    }
}

function seekTrack(e) {
    const progressBar = e.currentTarget;
    const clickPosition = e.clientX - progressBar.getBoundingClientRect().left;
    const percent = (clickPosition / progressBar.offsetWidth) * 100;
    config.audio.currentTime = (percent / 100) * config.audio.duration;
}

function loadConfig() {
    const saved = localStorage.getItem('lilbrpleer-config');
    if (saved) {
        const parsed = JSON.parse(saved);
        
        config.theme = parsed.theme || config.theme;
        config.opacity = parsed.opacity || config.opacity;
        config.particlesEnabled = parsed.particlesEnabled !== undefined ? parsed.particlesEnabled : config.particlesEnabled;
        config.backgroundImage = parsed.backgroundImage || config.backgroundImage;
        config.apiKeys = parsed.apiKeys || config.apiKeys;
        config.volume = parsed.volume || config.volume;
        config.history = parsed.history || config.history;
        config.favorites = parsed.favorites || config.favorites;
        
        applyConfig();
    }
}

function saveConfig() {
    const toSave = {
        theme: config.theme,
        opacity: config.opacity,
        particlesEnabled: config.particlesEnabled,
        backgroundImage: config.backgroundImage,
        apiKeys: config.apiKeys,
        volume: config.volume,
        history: config.history,
        favorites: config.favorites
    };
    localStorage.setItem('lilbrpleer-config', JSON.stringify(toSave));
}

function applyConfig() {
    // Тема
    document.body.className = `${config.theme}-theme`;
    document.getElementById('theme-selector').value = config.theme;
    
    // Прозрачность
    document.body.style.opacity = config.opacity / 100;
    document.getElementById('opacity-value').textContent = `${config.opacity}%`;
    document.getElementById('opacity-slider').value = config.opacity;
    
    // Частицы
    document.getElementById('particles-toggle').innerHTML = 
        `<i class="fas fa-sparkles"></i> Анимированные частицы: ${config.particlesEnabled ? 'Вкл' : 'Выкл'}`;
    
    // Фон
    if (config.backgroundImage) {
        document.body.style.backgroundImage = `url(${config.backgroundImage})`;
    } else {
        document.body.style.backgroundImage = '';
    }
    
    // API ключи
    document.getElementById('sc-key-input').value = config.apiKeys.soundcloud || '';
    document.getElementById('vk-key-input').value = config.apiKeys.vk || '';
    
    // Громкость
    document.getElementById('volume-slider').value = config.volume;
    config.audio.volume = config.volume / 100;
}

function toggleParticles() {
    config.particlesEnabled = !config.particlesEnabled;
    document.getElementById('particles-toggle').innerHTML = 
        `<i class="fas fa-sparkles"></i> Анимированные частицы: ${config.particlesEnabled ? 'Вкл' : 'Выкл'}`;
    
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    
    if (config.particlesEnabled) {
        initParticles();
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    saveConfig();
}

function openSettings(tab = 'appearance') {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('active');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelector(`.tab-content[data-tab="${tab}"]`).classList.add('active');
    
    if (tab === 'api') {
        document.querySelector('.api-tab-btn').click();
    }
}

function closeModal() {
    document.getElementById('settings-modal').classList.remove('active');
}

function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.classList.add('fade-out');
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

function showLoader() {
    const trackList = document.getElementById('track-list');
    trackList.innerHTML = `
        <div class="no-results">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Загрузка...</p>
        </div>
    `;
}

function hideLoader() {
}

function initParticles() {
    if (!config.particlesEnabled) return;
    
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    const particleCount = Math.floor(window.innerWidth / 10);
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 3 + 1,
            speedX: Math.random() * 1 - 0.5,
            speedY: Math.random() * 1 - 0.5
        });
    }
    
    function animate() {
        if (!config.particlesEnabled) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(187, 134, 252, 0.5)';
        
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            
            p.x += p.speedX;
            p.y += p.speedY;
            
            if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
            if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

function initEventListeners() {
    document.getElementById('settings-btn').addEventListener('click', () => openSettings());
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('settings-modal')) {
            closeModal();
        }
    });
    
    // Вкладки настроек
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.querySelector(`.tab-content[data-tab="${tab}"]`).classList.add('active');
        });
    });
    
    document.querySelectorAll('.api-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const api = this.dataset.api;
            
            document.querySelectorAll('.api-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.api-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.querySelector(`.api-tab-content[data-api="${api}"]`).classList.add('active');
        });
    });
    
    // Тема
    document.getElementById('theme-selector').addEventListener('change', (e) => {
        config.theme = e.target.value;
        document.body.className = `${config.theme}-theme`;
        saveConfig();
    });

    // Прозрачность
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        config.opacity = e.target.value;
        document.body.style.opacity = config.opacity / 100;
        document.getElementById('opacity-value').textContent = `${config.opacity}%`;
        saveConfig();
    });

    document.getElementById('particles-toggle').addEventListener('click', toggleParticles);

    // Фоновое изображение
    document.getElementById('bg-image-btn').addEventListener('click', () => {
        const url = document.getElementById('bg-image-input').value.trim();
        if (url) {
            if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/)) {
                const img = new Image();
                img.onload = () => {
                    config.backgroundImage = url;
                    document.body.style.backgroundImage = `url(${url})`;
                    saveConfig();
                    showAlert('Фоновое изображение успешно загружено', 'success');
                };
                img.onerror = () => {
                    showAlert('Не удалось загрузить изображение', 'error');
                };
                img.src = url;
            } else {
                showAlert('Пожалуйста, введите корректный URL изображения (jpg, png, gif, webp)', 'error');
            }
        }
    });

    // Сохранение API ключей
    document.getElementById('save-keys-btn').addEventListener('click', () => {
        config.apiKeys.soundcloud = document.getElementById('sc-key-input').value.trim();
        config.apiKeys.vk = document.getElementById('vk-key-input').value.trim();
        saveConfig();
        showAlert('Ключи успешно сохранены!', 'success');
        
        if (config.apiKeys.soundcloud) {
            checkSoundCloudKey();
        }
    });

    document.getElementById('search-btn').addEventListener('click', searchTracks);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchTracks();
    });

    document.getElementById('play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('prev-track').addEventListener('click', prevTrack);
    document.getElementById('next-track').addEventListener('click', nextTrack);
    
    document.getElementById('volume-btn').addEventListener('click', () => {
        const slider = document.getElementById('volume-slider');
        if (slider.style.display === 'block') {
            slider.style.display = 'none';
        } else {
            slider.style.display = 'block';
        }
    });
    
    document.getElementById('volume-slider').addEventListener('input', (e) => {
        config.volume = e.target.value;
        config.audio.volume = config.volume / 100;
        saveConfig();
    });
    
    document.querySelector('.progress-bar').addEventListener('click', seekTrack);
    config.audio.addEventListener('timeupdate', updateProgress);
    
    config.audio.addEventListener('ended', () => {
        document.getElementById('play-pause').innerHTML = '<i class="fas fa-play"></i>';
    });

    document.querySelectorAll('#sources li').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('#sources li').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            config.currentSource = this.dataset.source;
        });
    });
}

window.addEventListener('resize', () => {
    const canvas = document.getElementById('particles-canvas');
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

function initUI() {
    applyConfig();
    
    if (!localStorage.getItem('lilbrpleer-config')) {
        document.getElementById('sc-key-input').value = 'yNSW5UvBmb1A5j7qPUtIMuB9Itx3jsOC';
        config.apiKeys.soundcloud = 'yNSW5UvBmb1A5j7qPUtIMuB9Itx3jsOC';
        saveConfig();
    }
}