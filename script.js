/* TrackPoint: track this device, and watch someone who accepted a request */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const db = getFirestore(initializeApp({
  apiKey: "AIzaSyB3C9xCuYMSzwmxAekW4oq-ffKosktoKtw",
  authDomain: "finder-ca3cc.firebaseapp.com",
  projectId: "finder-ca3cc",
  storageBucket: "finder-ca3cc.firebasestorage.app",
  messagingSenderId: "386295386654",
  appId: "1:386295386654:web:652960ba9db8a5bff8140f"
}));

// Request links always use this public address, even if created from Live Server
const PUBLIC_URL = "https://finder-ca3cc.web.app/";
const $ = (id) => document.getElementById(id);


/* Map */
const map = L.map("map").setView([0.3476, 32.5825], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);


/* Geospatial helpers: haversine distance along a path */
const rad = Math.PI / 180;

function metresBetween(a, b) {
  const h = Math.sin((b[0] - a[0]) * rad / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin((b[1] - a[1]) * rad / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const pathLength = (pts) => pts.reduce((sum, p, i) => i ? sum + metresBetween(pts[i - 1], p) : sum, 0);
const fmtDistance = (m) => m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(2) + " km";
const fmtSpeed = (s) => s == null || isNaN(s) ? "0 km/h" : (s * 3.6).toFixed(1) + " km/h";
const fmtDirection = (d) => d == null || isNaN(d)
  ? "Not moving"
  : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8] + " (" + Math.round(d) + "°)";


/* One tracked person: marker, accuracy circle and movement path */
function makeTrack(color, newMarker) {
  const t = { points: [], marker: null, circle: null, path: null };

  t.update = (pos, accuracy) => {
    t.points.push(pos);
    const first = !t.marker;
    if (first) {
      t.marker = newMarker(pos);
      t.circle = L.circle(pos, { radius: accuracy, color, fillOpacity: 0.12 }).addTo(map);
      t.path = L.polyline(t.points, { color, weight: 4 }).addTo(map);
    } else {
      t.marker.setLatLng(pos);
      t.circle.setLatLng(pos).setRadius(accuracy);
      t.path.setLatLngs(t.points);
    }
    // Zoom to the pin on the first fix only; after that just follow it if it leaves the visible area,
    // so the person's own zooming and panning is never overridden
    if (first || !visibleArea().contains(map.latLngToContainerPoint(pos))) focusMap();
  };

  t.clear = () => {
    [t.marker, t.circle, t.path].forEach((layer) => layer && map.removeLayer(layer));
    t.marker = t.circle = t.path = null;
    t.points = [];
  };

  return t;
}

const PIN_SVG = '<svg viewBox="-1 -1 34 44" width="34" height="44" aria-hidden="true">' +
  '<path d="M16 0C7.2 0 0 7 0 15.7 0 27 16 42 16 42s16-15 16-26.3C32 7 24.8 0 16 0Z" fill="#f26b21" stroke="#fff" stroke-width="2"/>' +
  '<circle cx="16" cy="15.5" r="5.5" fill="#fff"/></svg>';

const mine = makeTrack("#2563eb", (pos) =>
  L.marker(pos, { icon: L.divIcon({ className: "orange-pin", html: PIN_SVG, iconSize: [34, 44], iconAnchor: [17, 43], popupAnchor: [0, -40] }) })
    .addTo(map).bindPopup("Your Current Location").openPopup());

const theirs = makeTrack("#16a34a", (pos) =>
  L.circleMarker(pos, { radius: 11, color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.95, weight: 3 })
    .addTo(map).bindPopup("Their location"));

/* The header and panel float over the map, so work out which part of it is still uncovered */
function coveredBy() {
  const panel = document.querySelector(".tracking-panel").getBoundingClientRect();
  const header = document.querySelector(".header").getBoundingClientRect();
  return innerWidth <= 900
    ? { left: 0, top: header.bottom, right: 0, bottom: innerHeight - panel.top }  // phone: panel at the bottom
    : { left: panel.right, top: 0, right: 0, bottom: 0 };                        // laptop: panel at the left
}

function visibleArea() {
  const c = coveredBy();
  const size = map.getSize();
  return L.bounds([c.left + 30, c.top + 30], [size.x - c.right - 30, size.y - c.bottom - 30]);
}

function focusMap() {
  const own = mine.marker?.getLatLng();
  const other = theirs.marker?.getLatLng();
  const c = coveredBy();

  if (own && other) {
    map.fitBounds([own, other], {
      paddingTopLeft: [c.left + 60, c.top + 60],
      paddingBottomRight: [c.right + 60, c.bottom + 60],
      maxZoom: 17
    });
  } else if (own || other) {
    // Put the pin in the visible part of the map (a little below its middle, so the pin and its popup fit above it)
    const zoom = own ? 17 : 16;
    const size = map.getSize();
    const wantX = (c.left + size.x - c.right) / 2;
    const wantY = c.top + (size.y - c.top - c.bottom) * (own ? 0.62 : 0.5);
    const centre = map.project(own || other, zoom).add([size.x / 2 - wantX, size.y / 2 - wantY]);
    map.setView(map.unproject(centre, zoom), zoom);
  }
}


addEventListener("resize", () => map.invalidateSize());

/* Phone: collapse or expand the panel so more of the map shows */
const panel = document.querySelector(".tracking-panel");
$("panelToggle").addEventListener("click", () => {
  const collapsed = panel.classList.toggle("collapsed");
  $("panelToggle").setAttribute("aria-expanded", String(!collapsed));
  focusMap();
});


/* Track this device */
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
let watchId = null;

function setStatus(text, color) {
  $("trackingStatus").textContent = text;
  $("statusDot").style.backgroundColor = color;
}

function startTracking() {
  if (!navigator.geolocation) return alert("Your browser does not support GPS location tracking.");
  if (watchId !== null) return;

  setStatus("Waiting for location...", "#f59e0b");
  startBtn.disabled = true;

  watchId = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) => {
      const { latitude, longitude, accuracy, heading, speed } = coords;

      $("latitude").textContent = latitude.toFixed(6);
      $("longitude").textContent = longitude.toFixed(6);
      $("accuracy").textContent = accuracy.toFixed(1) + " metres";
      $("lastUpdated").textContent = new Date(timestamp).toLocaleTimeString();
      $("direction").textContent = fmtDirection(heading);
      $("speed").textContent = fmtSpeed(speed);

      mine.update([latitude, longitude], accuracy);
      $("distance").textContent = fmtDistance(pathLength(mine.points));

      setStatus("Tracking Active", "#22c55e");
      stopBtn.disabled = false;
    },
    (error) => {
      const text = {
        1: "Location permission was denied.",
        2: "Location information is unavailable.",
        3: "Location request timed out."
      }[error.code] || "An unknown location error occurred.";
      alert(text);
      stopTracking();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  setStatus("Tracking Inactive", "#ef4444");
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", startTracking);
stopBtn.addEventListener("click", stopTracking);


/* Request someone's location */
let stopListening = null;
const setRequestStatus = (text) => { $("rqStatus").textContent = text; };

$("rqSend").addEventListener("click", async () => {
  const name = $("rqName").value.trim();
  if (!name) {
    $("rqName").focus();
    return setRequestStatus("Enter your name first.");
  }

  $("rqSend").disabled = true;
  if (stopListening) stopListening();
  stopListening = null;
  theirs.clear();
  $("rqDetails").textContent = "";

  try {
    const id = crypto.randomUUID();
    const ref = doc(db, "requests", id);
    await setDoc(ref, { requester: name, status: "pending", created: serverTimestamp() });

    const link = new URL("share.html", PUBLIC_URL);
    link.searchParams.set("id", id);

    const text = name + " would like to see your location. Open this link to accept or decline: " + link.href;
    const phone = $("rqPhone").value.replace(/\D/g, "");
    $("rqWhatsapp").href = "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);

    $("rqLinkText").textContent = link.href;
    $("rqLinkBox").hidden = false;

    const copyBtn = $("rqCopy");
    copyBtn.textContent = "Copy link";
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(link.href);
        copyBtn.textContent = "Link copied";
      } catch {
        copyBtn.textContent = "Copy it from the text below";
      }
    };

    setRequestStatus("Request created. Waiting for a response...");
    stopListening = onSnapshot(ref, (snap) => snap.exists() && showOtherPerson(snap.data()));
  } catch (error) {
    console.error("Firestore error:", error);
    setRequestStatus("Could not create the request. Check the console for details.");
  }

  $("rqSend").disabled = false;
});

const STATUS_TEXT = {
  declined: "The request was declined.",
  stopped: "The person stopped sharing their location.",
  pending: "Waiting for the person to respond..."
};

function showOtherPerson(data) {
  if (STATUS_TEXT[data.status]) return setRequestStatus(STATUS_TEXT[data.status]);
  if (data.status !== "accepted") return;
  if (typeof data.latitude !== "number") return setRequestStatus("Accepted. Waiting for their first location...");

  theirs.update([data.latitude, data.longitude], data.accuracy);

  const time = data.updated ? data.updated.toDate().toLocaleTimeString() : "just now";
  $("rqDetails").textContent =
    "Lat " + data.latitude.toFixed(6) + ", Lng " + data.longitude.toFixed(6) +
    " (accuracy " + Math.round(data.accuracy) + " m) at " + time +
    " | Distance moved: " + fmtDistance(pathLength(theirs.points)) +
    " | Direction: " + fmtDirection(data.heading) +
    " | Speed: " + fmtSpeed(data.speed);

  setRequestStatus("Live location active.");
}