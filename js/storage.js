const KEY_PREFIX = 'inf_board_v2_';

export const Storage = {
    saveChunk: (index, data) => {
        try {
            localStorage.setItem(`${KEY_PREFIX}chunk_${index}`, JSON.stringify(data));
        } catch (e) {
            console.warn("LocalStorage full or disabled", e);
        }
    },

    getChunk: (index) => {
        const data = localStorage.getItem(`${KEY_PREFIX}chunk_${index}`);
        return data ? JSON.parse(data) : null;
    },

    savePlayerState: (state) => {
        try {
            localStorage.setItem(`${KEY_PREFIX}player`, JSON.stringify(state));
        } catch(e) {}
    },

    getPlayerState: () => {
        const data = localStorage.getItem(`${KEY_PREFIX}player`);
        return data ? JSON.parse(data) : null;
    },

    clearAll: () => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(KEY_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    }
};

