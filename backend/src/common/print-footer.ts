/**
 * The footer every printed Zaroda document carries, matching the one already at
 * the foot of a report card. Shared so a bursar's cash book and a parent's
 * report card are recognisably the same system's paperwork, and so the wording
 * only ever has to change in one place.
 */
export const PRINT_FOOTER_CSS = `
  .z-powered{margin-top:28px;padding-top:14px;border-top:1px solid #e2e6f0;
    text-align:center;font-size:10px;color:#999;font-style:italic}
  @media print{.z-powered{position:running(footer)}}
`;

export const PRINT_FOOTER_HTML =
  `<div class="z-powered">Powered by ZARODA SOLUTIONS<br>Reliable. Innovative. Forward.</div>`;
