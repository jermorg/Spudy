const axios = require('axios');
const { getCobaltUrl } = require('./db');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveCobaltUrl() {
    return getCobaltUrl() || process.env.COBALT_LOCAL_URL || null;
}

async function downloadAsBuffer(url) {
    if (!url.includes('umbrel.local')) {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    }

    const cobaltUrl = resolveCobaltUrl();
    const targetUrl = new URL(url);
    const cobaltBase = new URL(cobaltUrl);

    const response = await axios.get(`${cobaltBase.origin}${targetUrl.pathname}${targetUrl.search}`, {
        responseType: 'arraybuffer',
        headers: { Host: cobaltBase.hostname }
    });

    return Buffer.from(response.data);
}

async function downloadViaCobalt(url) {
    const cobaltUrl = resolveCobaltUrl();
    if (!cobaltUrl) return null;

    const retryDelays = [0, 0, 3000, 5000];

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (retryDelays[attempt] > 0) {
            await sleep(retryDelays[attempt]);
        }

        try {
            const { data } = await axios.post(
                cobaltUrl,
                { localProcessing: 'preferred', url },
                {
                  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                  validateStatus: (status) => status < 600
                }
            );

            if (data?.status === 'error' && data?.error?.code === 'error.api.fetch.fail') {
                if (attempt === retryDelays.length - 1) return null;
                continue;
            }

            if (!['redirect', 'tunnel', 'picker'].includes(data?.status)) {
                console.error('[COBALT][❌] Unexpected status:', data);
                return null;
            }

            if (data.status === 'redirect' || data.status === 'tunnel') {
                const videoBuffer = await downloadAsBuffer(data.url);
                return [{ attachment: videoBuffer, name: data.filename || 'video.mp4' }];
            }

            const files = [];
            if (data.audio) {
                try {
                    const audioBuffer = await downloadAsBuffer(data.audio);
                    files.push({ attachment: audioBuffer, name: 'music_from_video.mp3' });
                } catch (err) {
                    console.error('[COBALT][❌] Audio download error:', err.message);
                }
            }

            if (Array.isArray(data.picker)) {
                data.picker
                    .filter((item) => item.type === 'photo')
                    .forEach((item, index) => {
                        files.push({
                            attachment: item.url,
                            name: `photo_${Date.now()}_${index}.jpeg`
                        });
                    });
            }

            return files.length > 0 ? files : null;
        } catch (err) {
            console.error(`[COBALT][❌] Attempt ${attempt + 1} error:`, err.message);
            if (attempt === retryDelays.length - 1) return null;
        }
    }

    return null;
}

module.exports = { downloadViaCobalt };