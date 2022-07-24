export default async function ({ addon, global, console, msg }) {
  let pendingReplacement = false;

  let ADJECTIVES;
  let NOUNS;
  let FIRSTADJECTIVES;

  genWords(addon.auth.scratchLang);

  let reduxAvailable = Boolean(addon.tab.redux.state);
  while (!reduxAvailable) {
    await new Promise((resolve) => {
      setTimeout(() => {
        reduxAvailable = Boolean(addon.tab.redux.state);
        resolve();
      }, 0);
    });
  }

  addon.tab.redux.initialize();
  let isFileUpload = false;
  addon.tab.redux.addEventListener("statechanged", async (e) => {
    if (e.detail.action.type === "scratch-gui/project-state/DONE_LOADING_VM_WITHOUT_ID") {
      // Current loadingState is SHOWING_WITHOUT_ID

      if (pendingReplacement) {
        // Never happens AFAIK
        console.log("Pending replacement");
        return;
      }
      pendingReplacement = true;

      let expired = false; // So that nothing goes catastrophically wrong
      setTimeout(() => (expired = true), 10000);

      const isLoggedIn = await addon.auth.fetchIsLoggedIn();
      if (isLoggedIn) {
        await addon.tab.redux.waitForState((state) => state.scratchGui.projectState.loadingState === "CREATING_NEW");
        await addon.tab.redux.waitForState((state) => state.scratchGui.projectState.loadingState === "SHOWING_WITH_ID");
        await addon.tab.redux.waitForState((state) => state.scratchGui.projectState.loadingState === "AUTO_UPDATING");
        await addon.tab.redux.waitForState((state) => state.scratchGui.projectState.loadingState === "SHOWING_WITH_ID");
        // By this point, vanilla new project was saved to cloud
      }

      if (addon.settings.get("auto-on-create") && !expired && !isFileUpload) setProjectName();
      pendingReplacement = false;
      isFileUpload = false;
    } else if (e.detail.action.type === "scratch-gui/project-state/START_LOADING_VM_FILE_UPLOAD") {
      // A file upload will then dispatch DONE_LOADING_VM_WITHOUT_ID, but we should ignore it
      isFileUpload = true;
    }
  });

  // Create the randomizer button
  let button;
  createButton();

  addon.tab.redux.addEventListener("statechanged", async (e) => {
    if (e.detail.action.type === "projectTitle/SET_PROJECT_TITLE") {
      let showButton = await shouldButtonShow();
      if (showButton) createButton();
      else removeButton();
    }
  });
  addon.tab.redux.addEventListener("statechanged", async (e) => {
    if (e.detail.action.type === "scratch-gui/locales/SELECT_LOCALE") {
      genWords(e.detail.action.locale);
    }
  });
  addon.tab.addEventListener("urlChange", () => {
    if (!addon.self.disabled && addon.tab.editorMode === "editor") createButton();
    else if (addon.tab.editorMode !== "editor" && button) removeButton();
  });
  addon.self.addEventListener("disabled", () => removeButton());
  addon.self.addEventListener("reenabled", () => createButton());
  addon.settings.addEventListener("change", async () => {
    let showButton = await shouldButtonShow();
    if (showButton) createButton();
    else removeButton();
  });

  async function shouldButtonShow() {
    let currentName = await addon.tab.redux.state.scratchGui.projectTitle;
    if (!addon.settings.get("only-untitled") || currentName === "" || currentName.includes("Untitled")) {
      return true;
    } else {
      return false;
    }
  }

  async function createButton() {
    let showButton = await shouldButtonShow();
    if (!showButton || document.querySelector("#sa-project-title-generator-button") !== null) {
      return;
    }
    let nameContainer = await addon.tab.waitForElement('[class*="menu-bar_menu-bar-item"][class*="menu-bar_growable"]');
    nameContainer.classList.add("sa-project-title-generator");
    let nameField = await addon.tab.waitForElement('[class*="project-title-input_title-field"]');
    if (button) button.remove();
    button = document.createElement("span");
    button.id = "sa-project-title-generator-button";
    button.className = addon.tab.scratchClass(
      "button_outlined-button",
      "menu-bar_menu-bar-button",
      "community-button_community-button"
    );
    let buttonImg = document.createElement("img");
    buttonImg.id = "sa-project-title-generator-button-img";
    buttonImg.className = addon.tab.scratchClass("community-button_community-button-icon", "button_icon");
    buttonImg.src = addon.self.dir + "/dice-five.svg";
    button.appendChild(buttonImg);
    nameField.after(button);
    button.addEventListener("click", () => setProjectName());
  }

  async function removeButton() {
    let nameContainer = await addon.tab.waitForElement('[class*="menu-bar_menu-bar-item"][class*="menu-bar_growable"]');
    nameContainer.classList.remove("sa-project-title-generator");
    button.remove();
  }

  async function setProjectName() {
    let adj1 = randomAdj();
    //the chance of being the second adjective blank grows by the length of the first adjective
    let adj2 = randomAdj(Math.floor(100/adj1.length), adj1);
    let noun1 = NOUNS[randi(NOUNS.length)];
    let newName = `${adj1} ${adj2} ${noun1}`;
    if (FIRSTADJECTIVES === false) {
      newName = `${noun1} ${adj1} ${adj2}`;
    }
    addon.tab.redux.dispatch({ type: "projectTitle/SET_PROJECT_TITLE", title: newName });
  }

  function randomAdj(blankChance=30, prevAdj="") {
    // console.log("1:" + JSON.stringify(blankChance))
    if (randi(blankChance) < 2) {
      //The adjective will be blank by some chance
      return "";
    } else {
      let adj = ADJECTIVES[randi(ADJECTIVES.length)];
      if (prevAdj !== "") { // if it's the second adjective
        while (((prevAdj[0] !== adj[0]) && (randi(2) !== 1)) || (adj === prevAdj)) {
          //if the first letter of the adjectives doesn't match there's some chance, a new one will be generated
          //Or if the adjectives are the same, it will generates a new too
          adj = ADJECTIVES[randi(ADJECTIVES.length)];
        }
      }
      return adj;
    }
  }

  function randi(max) {
    return Math.floor(Math.random() * max);
  }
  
  async function genWords(lang) {
    try {
      ADJECTIVES = (await import("./data/" + lang + ".js")).adjectives;
      NOUNS = (await import("./data/" + lang + ".js")).nouns;
      FIRSTADJECTIVES = (await import("./data/" + lang + ".js")).firstAdjectives;
    } catch (error) {
      ADJECTIVES = (await import("./data/en.js")).adjectives;
      NOUNS = (await import("./data/en.js")).nouns;
      FIRSTADJECTIVES = (await import("./data/en.js")).firstAdjectives;
    }
  }
}
