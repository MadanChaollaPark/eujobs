import { ImageResponse } from 'next/og';

export const alt = 'EUJobs — Work with purpose. Connect with Europe.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#153e35',
        color: '#f7f8f2',
        padding: '64px 76px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 48 }}>
        <svg width="60" height="60" viewBox="0 0 64 64">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
            const angle = (index * Math.PI) / 4 - Math.PI / 2;
            return (
              <circle
                key={index}
                cx={32 + Math.cos(angle) * 23}
                cy={32 + Math.sin(angle) * 23}
                r="4.8"
                fill={index === 2 || index === 3 ? '#d8ef9b' : '#f7f8f2'}
              />
            );
          })}
        </svg>
        <div style={{ display: 'flex' }}>
          <span style={{ fontWeight: 700 }}>eu</span>
          <span>jobs</span>
          <span style={{ color: '#d8ef9b' }}>.</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 66,
          fontSize: 76,
          lineHeight: 1.08,
          letterSpacing: '-3px',
        }}
      >
        <span>Work with purpose.</span>
        <span style={{ color: '#d8ef9b' }}>Connect with Europe.</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'auto',
          borderTop: '1px solid #50746b',
          paddingTop: 25,
          fontSize: 24,
        }}
      >
        <span>Jobs · Policy events · Community</span>
        <span>eujobs.co</span>
      </div>
    </div>,
    size,
  );
}
