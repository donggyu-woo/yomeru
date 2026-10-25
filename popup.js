const triggerMode = document.getElementById('trigger-mode');

chrome.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
  triggerMode.value = settings.triggerMode;
});

triggerMode.addEventListener('change', () => {
  chrome.storage.local.set({ triggerMode: triggerMode.value });
});
