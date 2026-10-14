const MemorialLogo = ({ className = '', size = 44, light = true }) => (
  <svg
    className={`memorial-logo-badge ${className}`}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    role="img"
    aria-label="Cogon Memorial Records System logo"
    xmlns="http://www.w3.org/2000/svg"
    style={{ minWidth: size, minHeight: size, flexShrink: 0 }}
  >
    {/* Soft light rounded container matching user's Image 2 */}
    <rect
      x="2"
      y="2"
      width="44"
      height="44"
      rx="13"
      fill={light ? '#f1f3f5' : '#ffffff'}
      stroke="#cbd5e1"
      strokeWidth="1.2"
    />
    {/* Dark cross and mound matching user's Image 2 */}
    <path
      d="M24 9v22M17 16h14"
      fill="none"
      stroke="#1e293b"
      strokeWidth="3.4"
      strokeLinecap="round"
    />
    <path
      d="M12 35c4.4-2.5 8.4-3.7 12-3.7s7.6 1.2 12 3.7"
      fill="none"
      stroke="#1e293b"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M15 39h18"
      fill="none"
      stroke="#1e293b"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);

export default MemorialLogo;
