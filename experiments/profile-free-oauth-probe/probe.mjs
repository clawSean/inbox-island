const button = document.querySelector("#probe");
const status = document.querySelector("#status");

button.addEventListener("click", async (event) => {
  document.documentElement.dataset.trusted = String(event.isTrusted);
  document.documentElement.dataset.activation = String(navigator.userActivation?.isActive === true);
  status.textContent = "pending";
  try {
    await chrome.identity.getAuthToken({ interactive: true });
    status.textContent = "token-returned";
  } catch (error) {
    status.textContent = `error:${error?.message || String(error)}`;
  }
});
