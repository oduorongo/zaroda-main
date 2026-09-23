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

/**
 * Page-break rules for a long table. Without these Chromium will happily split
 * a row in half across a page boundary and leave the continuation with no
 * column headings, which makes a multi-page cash book unreadable.
 */
export const PRINT_PAGE_CSS = `
  thead{display:table-header-group}
  /* table-row-group, NOT table-footer-group: a tfoot repeats on every page in
     paged media, which printed the totals at the foot of each sheet as though
     each were a page total. A set of books has one grand total, at the end. */
  tfoot{display:table-row-group}
  tr{page-break-inside:avoid;break-inside:avoid}
  h3{page-break-after:avoid;break-after:avoid}
  table{page-break-inside:auto}
`;
