// The navy "Powered by ZARODA SOLUTIONS" bar along the bottom of every page, the same as Zaroda Events
// and the Zaroda POS apps. On a phone only "Powered by" is dropped so the line still fits.
export default function PoweredByRibbon() {
  return (
    <footer
      className="no-print flex-shrink-0 px-2 py-1.5 text-center text-[0.68rem] leading-snug text-white/80 sm:px-4 sm:py-2.5 sm:text-[0.8rem]"
      style={{ background: '#0a1633', boxShadow: '0 -2px 10px rgba(5,12,35,0.25)' }}
    >
      <span className="hidden sm:inline">Powered by </span>
      <strong className="text-white">ZARODA SOLUTIONS</strong>
      <span className="sm:hidden"> · </span>
      <span className="hidden sm:inline"> - </span>
      Innovative. Reliable. Forward.
    </footer>
  );
}
