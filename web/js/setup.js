import { api } from "./api.js";
import { showToast } from "./ui.js";

document.getElementById("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const input = document.getElementById("bot-token");
    const btn = document.getElementById("setup-submit-btn");
    const token = input.value.trim();

    if (!token) return;

    btn.disabled = true;
    btn.textContent = "Verifying token...";

    try {
        const res = await api.saveToken(token);
        const botName = res.bot?.username ? `@${res.bot.username}` : "Bot";
        showToast(`${botName} connected & started!`, "success");
        btn.textContent = "Redirecting...";
        setTimeout(() => {
            window.location.href = "/";
        }, 800);
    } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.textContent = "Verify & Start Bot";
    }
});