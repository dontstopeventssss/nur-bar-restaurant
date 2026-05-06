'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            color: '#111',
            textAlign: 'center',
          }}
        >
          NUR APP BAR
        </h1>

        <p
          style={{
            marginTop: 8,
            marginBottom: 24,
            textAlign: 'center',
            color: '#666',
            fontSize: 15,
          }}
        >
          Seleziona area
        </p>

        <div
          style={{
            display: 'grid',
            gap: 12,
          }}
        >
          <button onClick={() => router.push('/staff')} style={buttonStyle}>
            PER SALA
          </button>

          <button onClick={() => router.push('/bar')} style={buttonStyle}>
            NOTIFICHE BAR
          </button>

          <button onClick={() => router.push('/kitchen')} style={buttonStyle}>
            NOTIFICHE CUCINA
          </button>

          <button onClick={() => router.push('/owner')} style={ownerButtonStyle}>
            AREA OWNER
          </button>
        </div>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 10,
  border: '1px solid #ccc',
  background: '#111',
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};

const ownerButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 10,
  border: '1px solid #ccc',
  background: '#fff',
  color: '#111',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};