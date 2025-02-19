import { getDatabase, ref, push, onChildAdded, remove, set, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

// 🔥 Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAxUcOrQ0IX6Soz77nH8LKWOvkrHxJfCbY",
    authDomain: "prixjour.firebaseapp.com",
    projectId: "prixjour",
    storageBucket: "prixjour.firebasestorage.app",
    messagingSenderId: "468819038880",
    appId: "1:468819038880:web:b3809587a096cc046defc5",
    measurementId: "G-JY8YT5S6QX"
};

// 📌 Initialisation Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const chatRef = ref(database, "chat");
const callRef = ref(database, "call");

// 🎯 Sélection des éléments HTML
const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const recordBtn = document.getElementById("record-btn");
const stopBtn = document.getElementById("stop-btn");
const imageInput = document.getElementById("image-input");
const callBtn = document.getElementById("call-btn");
const answerBtn = document.getElementById("answer-btn");

// WebRTC Configuration
let peerConnection;
const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// 📞 Lancer un appel
callBtn.addEventListener("click", async () => {
    peerConnection = new RTCPeerConnection(config);
    setupPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    set(callRef, { offer: offer });
});

// 📞 Répondre à un appel
answerBtn.addEventListener("click", async () => {
    peerConnection = new RTCPeerConnection(config);
    setupPeerConnection();

    onValue(callRef, async (snapshot) => {
        const data = snapshot.val();
        if (data && data.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            set(callRef, { answer: answer });
        }
    });
});

// Gérer la connexion entre pairs
function setupPeerConnection() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    });
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            push(callRef, { candidate: event.candidate });
        }
    };
}

// 📩 Envoi d'un message texte
sendBtn.addEventListener("click", () => {
    const message = chatInput.value.trim();
    if (message !== "") {
        push(chatRef, {
            user: "Client",
            text: message,
            timestamp: Date.now()
        });
        chatInput.value = "";
    }
});

// 📷 Envoi d'une image
imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
            push(chatRef, {
                user: "Client",
                image: reader.result,
                timestamp: Date.now()
            });
        };
    }
});

// 📡 Réception et affichage des messages avec bouton de suppression
onChildAdded(chatRef, (snapshot) => {
    const data = snapshot.val();
    const messageId = snapshot.key;
    const messageElement = document.createElement("div");
    messageElement.classList.add("message");
    messageElement.setAttribute("data-id", messageId);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.classList.add("delete-btn");
    deleteBtn.onclick = () => deleteMessage(messageId);

    if (data.text) {
        messageElement.innerHTML = `<strong>${data.user}:</strong> ${data.text}`;
    } else if (data.audio) {
        const audioElement = document.createElement("audio");
        audioElement.controls = true;
        audioElement.src = data.audio;
        messageElement.appendChild(audioElement);
    } else if (data.image) {
        const imageElement = document.createElement("img");
        imageElement.src = data.image;
        imageElement.alt = "Image envoyée";
        imageElement.style.maxWidth = "100%";
        imageElement.style.borderRadius = "8px";
        imageElement.style.marginTop = "10px";
        messageElement.appendChild(imageElement);
    }

    messageElement.appendChild(deleteBtn);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// 🗑️ Fonction pour supprimer un message
function deleteMessage(messageId) {
    const messageRef = ref(database, `chat/${messageId}`);
    remove(messageRef).then(() => {
        console.log("✅ Message supprimé !");
        const messageElement = document.querySelector(`[data-id='${messageId}']`);
        if (messageElement) {
            messageElement.remove();
        }
    }).catch((error) => {
        console.error("❌ Erreur lors de la suppression :", error);
    });
}
