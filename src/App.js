import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/auth';
import 'firebase/analytics';

import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';

firebase.initializeApp({
  apiKey: "AIzaSyCsLfNmW8nIfGb5Ry_oBVsGAm-6nQwnxuk",
  authDomain: "firechat-41020.firebaseapp.com",
  projectId: "firechat-41020",
  storageBucket: "firechat-41020.firebasestorage.app",
  messagingSenderId: "922956987193",
  appId: "1:922956987193:web:341df48a8f8345c3a306e8",
  measurementId: "G-J4F1ZZ65MX"
})

const auth = firebase.auth();
const firestore = firebase.firestore();
const analytics = firebase.analytics();


function App() {
  const [user] = useAuthState(auth);
  const [currentRoom, setCurrentRoom] = useState(null);

  return (
    <div className="App">
      <header>
        <h1>⚛️🔥💬</h1>
        <SignOut />
      </header>

      <section>
        {user ? (
          currentRoom ? (
            <ChatRoom roomId={currentRoom} onLeaveRoom={() => setCurrentRoom(null)} />
          ) : (
            <RoomSelector onRoomSelect={setCurrentRoom} />
          )
        ) : (
          <SignIn />
        )}
      </section>
    </div>
  );
}

function SignIn() {

  const signInWithGoogle = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
  }

  return (
    <>
      <button className="sign-in" onClick={signInWithGoogle}>Sign in with Google</button>
      <p>Do not violate the community guidelines or you will be banned for life!</p>
    </>
  )

}

function SignOut() {
  return auth.currentUser && (
    <button className="sign-out" onClick={() => auth.signOut()}>Sign Out</button>
  )
}

function RoomSelector({ onRoomSelect }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const roomsRef = firestore.collection('rooms');
  // Remove orderBy to avoid index issues, we'll sort in the component
  const [rooms] = useCollectionData(roomsRef, { idField: 'id' });

  const createRoom = async (e) => {
    e.preventDefault();
    const roomName = newRoomName.trim();
    
    if (!roomName || isCreating) return;

    setIsCreating(true);
    
    try {
      // Check if user is authenticated
      if (!auth.currentUser) {
        throw new Error('User not authenticated');
      }

      const { uid, displayName, photoURL } = auth.currentUser;
      console.log('Creating room with user:', { uid, displayName, photoURL });
      console.log('Room name:', roomName);
      
      // Test basic Firestore write first
      console.log('Testing Firestore write...');
      
      const docRef = await roomsRef.add({
        name: roomName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: uid,
        creatorName: displayName || 'Anonymous',
        creatorPhoto: photoURL || '',
        memberCount: 1
      });
      
      console.log('Room created successfully with ID:', docRef.id);
      
      setNewRoomName('');
      setShowCreateForm(false);
      onRoomSelect(docRef.id);
    } catch (error) {
      console.error('Full error object:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      let errorMessage = error.message;
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check Firestore security rules.';
      } else if (error.code === 'unauthenticated') {
        errorMessage = 'User not authenticated. Please sign in again.';
      }
      
      alert(`Failed to create room: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = (roomId) => {
    onRoomSelect(roomId);
  };

  return (
    <div className="room-selector">
      <h2>Choose a Chat Room</h2>
      
      <div className="room-actions">
        <button 
          className="create-room-btn" 
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : 'Create New Room'}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={createRoom} className="create-room-form">
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Enter room name"
            maxLength={50}
            disabled={isCreating}
          />
          <button type="submit" disabled={!newRoomName.trim() || isCreating}>
            {isCreating ? 'Creating...' : 'Create Room'}
          </button>
        </form>
      )}

      <div className="rooms-list">
        <h3>Available Rooms</h3>
        {rooms === undefined ? (
          <p>Loading rooms...</p>
        ) : rooms && rooms.length > 0 ? (
          // Sort rooms by createdAt in the component to avoid Firestore index issues
          rooms
            .filter(room => room && room.id) // Filter out any null/undefined rooms
            .sort((a, b) => {
              if (!a.createdAt) return 1;
              if (!b.createdAt) return -1;
              return b.createdAt.seconds - a.createdAt.seconds;
            })
            .map(room => (
              <div key={room.id} className="room-item" onClick={() => joinRoom(room.id)}>
                <div className="room-info">
                  <h4>{room.name}</h4>
                  <p>Created by {room.creatorName || 'Anonymous'}</p>
                  <span className="member-count">👥 {room.memberCount || 1} members</span>
                </div>
                <button className="join-btn">Join</button>
              </div>
            ))
        ) : (
          <p>No rooms available. Create the first one!</p>
        )}
      </div>
    </div>
  );
}


function ChatRoom({ roomId, onLeaveRoom }) {
  const dummy = useRef();
  const messagesRef = firestore.collection('rooms').doc(roomId).collection('messages');
  const query = messagesRef.orderBy('createdAt').limit(25);

  const [messages] = useCollectionData(query, { idField: 'id' });
  const [roomData, setRoomData] = useState(null);
  const [formValue, setFormValue] = useState('');

  // Fetch room data
  React.useEffect(() => {
    const unsubscribe = firestore.doc(`rooms/${roomId}`).onSnapshot(doc => {
      if (doc.exists) {
        setRoomData({ id: doc.id, ...doc.data() });
      }
    });
    return unsubscribe;
  }, [roomId]);

  const sendMessage = async (e) => {
    e.preventDefault();

    const { uid, photoURL, displayName } = auth.currentUser;
    const messageText = formValue.trim();
    
    if (!messageText) return;

    // Clear the input immediately for better UX
    setFormValue('');

    try {
      await messagesRef.add({
        text: messageText,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        uid,
        photoURL,
        displayName
      });
      
      dummy.current.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Error sending message:', error);
      // Restore the message if sending failed
      setFormValue(messageText);
    }
  };



  return (
    <>
      <div className="chat-header">
        <button className="back-btn" onClick={onLeaveRoom}>← Back to Rooms</button>
        <h2>{roomData?.name || 'Loading...'}</h2>
      </div>

      <main>
        {messages && Array.isArray(messages) ? (
          messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
        ) : (
          <p>Loading messages...</p>
        )}
        <span ref={dummy}></span>
      </main>

      <form onSubmit={sendMessage}>
        <input 
          value={formValue} 
          onChange={(e) => setFormValue(e.target.value)} 
          placeholder="say something nice" 
        />
        <button type="submit" disabled={!formValue}>🕊️</button>
      </form>
    </>
  );
}


function ChatMessage(props) {
  const { text, uid, photoURL } = props.message;

  const messageClass = uid === auth.currentUser.uid ? 'sent' : 'received';

  return (<>
    <div className={`message ${messageClass}`}>
      <img src={photoURL || 'https://api.adorable.io/avatars/23/abott@adorable.png'} />
      <p>{text}</p>
    </div>
  </>)
}


export default App;
