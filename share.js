/* TrackPoint share page: the tracked person accepts, then their location is sent */

import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const db = getFirestore(initializeApp({
  apiKey: "AIzaSyB3C9xCuYMSzwmxAekW4oq-ffKosktoKtw",
  authDomain: "finder-ca3cc.firebaseapp.com",
  projectId: "finder-ca3cc",
  storageBucket: "finder-ca3cc.firebasestorage.app",
  messagingSenderId: "386295386654",
  appId: "1:386295386654:web:652960ba9db8a5bff8140f"
}));

const $ = (id) => document.getElementById(id);
const [title, message, acceptBtn, declineBtn, stopBtn, statusBox, statusText] =
  ["title", "message", "acceptBtn", "declineBtn", "stopBtn", "statusBox", "statusText"].map($);

let watchId = null;
let requestRef = null;

const show = (heading, text) => { title.textContent = heading; message.textContent = text; };

const setStatus = (text, kind = "") => {
  statusText.textContent = text;
  statusBox.className = "tracking-status " + kind;
};

const setButtons = ({ accept = false, decline = false, stop = false }) => {
  acceptBtn.hidden = !accept;
  declineBtn.hidden = !decline;
  stopBtn.hidden = !stop;
};

async function saveStatus(status) {
  try {
    await updateDoc(requestRef, { status });
    return true;
  } catch (error) {
    console.error("Firestore error:", error);
    return false;
  }
}

function stopWatching() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
window.addEventListener("pagehide", () => {
  stopWatching();
});

/* Load the request named in the link */
async function loadRequest() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) return show("Invalid link", "This link is missing its request code. Ask the sender for a new link.");

  try {
    requestRef = doc(db, "requests", id);
    const snap = await getDoc(requestRef);
    if (!snap.exists()) return show("Request not found", "This request no longer exists. Ask the sender for a new link.");

    const data = snap.data();

    if (data.status === "pending") {
      show(data.requester + " wants to see your location",
        "If you accept, your live location is shared with them while this page stays open. You can stop at any time.");
      setButtons({ accept: true, decline: true });
    } else if (data.status === "accepted") {
      show("Sharing paused",
        "You accepted a request from " + data.requester + " earlier. Tap the button to start sharing again.");
      acceptBtn.textContent = "Resume sharing";
      setButtons({ accept: true });
    } else {
      show("Request closed",
        "This request was " + data.status + ". Ask the sender for a new link if you want to share again.");
    }
  } catch (error) {
    console.error("Firestore error:", error);
    show("Could not load the request",
      "Check your internet connection. If you use Brave or an ad blocker, turn it off for this site.");
  }
}


/* Send the location while the page is open (falls back to approximate location if GPS is weak) */
const GEO_ERRORS = {
  1: "Location permission was denied. Allow location for this site and try again.",
  2: "Your location is unavailable. Turn on GPS and try again.",
  3: "Getting your location timed out. Try again."
};

function startSharing(highAccuracy = true) {
  if (!navigator.geolocation) return setStatus("This browser does not support location.", "ended");

  setStatus("Waiting for your location...", "pending");

  watchId = navigator.geolocation.watchPosition(
    async ({ coords }) => {
      try {
        await updateDoc(requestRef, {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
          updated: serverTimestamp()
        });
        setStatus("Sharing your location. Keep this page open.", "active");
      } catch (error) {
        console.error("Firestore error:", error);
        setStatus("Could not send your location.", "ended");
      }
    },
    (error) => {
      stopWatching();
      if (error.code === 3 && highAccuracy) {
        setStatus("GPS signal is weak. Trying approximate location...", "pending");
        return startSharing(false);
      }
      setStatus(GEO_ERRORS[error.code] || "An unknown location error occurred.", "ended");
      setButtons({ accept: true });
    },
    { enableHighAccuracy: highAccuracy, maximumAge: 5000, timeout: highAccuracy ? 30000 : 60000 }
  );
}


/* Buttons */
acceptBtn.addEventListener("click", async () => {
  if (!await saveStatus("accepted")) return setStatus("Could not accept the request. Try again.", "ended");

  setButtons({ stop: true });
  show("You are sharing your location", "Keep this page open with the screen on. Tap Stop sharing when you are done.");
  startSharing();
});

declineBtn.addEventListener("click", async () => {
  await saveStatus("declined");
  setButtons({});
  show("Request declined", "Nothing was shared. You can close this page.");
  setStatus("Not sharing your location.", "ended");
});

stopBtn.addEventListener("click", async () => {
  stopWatching();

  try {
    await updateDoc(requestRef, {
      status: "stopped",
      latitude: deleteField(),
      longitude: deleteField(),
      accuracy: deleteField(),
      heading: deleteField(),
      speed: deleteField(),
      updated: serverTimestamp()
    });

    
    setButtons({});

    show(
      "Sharing stopped",
      "Your location is no longer being shared. Your previous coordinates have been cleared."
    );

    setStatus("Not sharing your location.", "ended");

  } catch (error) {
    console.error("Could not stop sharing:", error);
    setStatus("Could not update sharing status. Please retry.", "ended");
  }
});


loadRequest();
