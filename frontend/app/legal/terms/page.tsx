import Link from 'next/link';

export const metadata = {
  title: 'Terms of service — Zaroda School Management System',
  description:
    'The terms on which ZARODA Solutions provides the Zaroda School Management System: '
    + 'subscriptions, what the software does and does not do, and who owns a school’s records.',
  alternates: { canonical: '/legal/terms' },
};

const UPDATED = '22 September 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of service</h1>
      <p className="sub">Last updated {UPDATED}</p>

      <p>
        These are the terms on which <strong>ZARODA Solutions</strong> provides the Zaroda School
        Management System. Using it means accepting them.
      </p>

      <h2>1. What Zaroda SMS is</h2>
      <p>
        Software for running a Kenyan school under the competency-based curriculum: registration,
        streams and timetabling, attendance, assessment and report cards, Grade 10 pathway
        selection, fees and payroll, communication with parents, and the professional records a
        teacher must keep.
      </p>
      <p>
        <strong>It is a tool, not a substitute for your own judgement or your own duties.</strong>{' '}
        It does not certify a report card, does not file anything with KNEC, the Ministry, the TSC
        or the Kenya Revenue Authority on your behalf, and does not relieve the school of any
        statutory obligation. What it produces is derived from what you enter: entered wrongly, it
        will be wrong, and responsibility for what is entered and for what is submitted to anybody
        remains the school&rsquo;s.
      </p>
      <p>
        Statutory payroll rates (PAYE, NSSF, SHA, the Housing Levy) are set to the guidance
        current when the software was built. They change by government notice. Check them against
        the latest official rates before relying on a payslip for compliance.
      </p>

      <h2>2. A school&rsquo;s records belong to the school</h2>
      <p>
        Everything a school enters — learners, marks, attendance, fees, staff records — is the
        school&rsquo;s property, not ours. We hold it on the school&rsquo;s instruction as its
        data processor. We do not sell it, mine it, advertise against it, or use it to train any
        model. See the <Link href="/legal/privacy">privacy policy</Link> for what this means in
        practice.
      </p>
      <p>
        You can export your data at any time while the account is live. If you leave, ask and we
        will provide it.
      </p>

      <h2>3. Accounts and access</h2>
      <p>
        Keep your password to yourself and do not let others use your login. This system holds
        children&rsquo;s personal data, and a shared login makes the access log meaningless —
        which is the record the school relies on if it is ever asked who saw what.
      </p>
      <p>
        A school is responsible for the staff accounts it creates and for the role it gives each
        one. When somebody leaves, deactivate them.
      </p>
      <p>
        Tell us promptly if you believe an account has been misused.
      </p>

      <h2>4. Subscriptions and payment</h2>
      <p>
        <strong>Zaroda SMS is free for the whole of 2026, with every module unlocked.</strong>{' '}
        Nothing is payable until 15 January 2027. Module access is not restricted during this
        period — it begins to follow your plan once you subscribe, which is what the next two
        paragraphs describe.
      </p>
      <p>
        <strong>Essential</strong> is the base subscription and is charged per stream, per year:
      </p>
      <ul>
        <li>Primary and Junior School (Grade 1&ndash;9) — KES 2,400 per stream, per year</li>
        <li>Senior School (Grade 10&ndash;12) — KES 3,360 per stream, per year</li>
      </ul>
      <p>
        It covers fee structures, invoicing and M-Pesa collection; academic marks, report cards
        and mark lists; school-wide analytics; and the Communication, Library, Sports and
        Discipline modules.
      </p>
      <p>
        <strong>Pro</strong> is an addition to Essential, not a replacement for it. It costs a
        flat <strong>KES 4,500 per school, per year on top of</strong> the per-stream Essential
        fee, and unlocks three further modules:
      </p>
      <ul>
        <li><strong>Payroll</strong> — PAYE, NSSF, SHA, Housing Levy and payslips</li>
        <li><strong>HR</strong> — staff records, appraisals and recruitment</li>
        <li><strong>Student Transport</strong> — routes, vehicles and transport fee billing</li>
      </ul>
      <p>
        A school on Essential keeps everything listed above it; only those three modules are
        closed. Nothing entered in them during the free period is deleted — it becomes reachable
        again if you later add Pro.
      </p>
      <p>
        Payment is by M-Pesa. Prices may change, but not during a period you have already paid
        for, and we will give notice before a change takes effect.
      </p>
      <p>
        Professional Records generation is billed separately from a teacher&rsquo;s own wallet,
        per item generated, at the price shown before each generation.
      </p>

      <h2>5. If a subscription lapses</h2>
      <p>
        Your records are not deleted because a subscription has lapsed. A school&rsquo;s books and
        a learner&rsquo;s academic history are records it may need years later, and destroying
        them over a missed payment would do real harm. Access may be restricted until the
        subscription is settled; the data stays, and stays exportable on request.
      </p>

      <h2>6. Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>enter personal data about anybody the school has no lawful reason to hold</li>
        <li>use another person&rsquo;s login, or share your own</li>
        <li>attempt to reach another school&rsquo;s data, or to defeat the role restrictions</li>
        <li>use the communication tools to send anything unlawful, or to send marketing to parents</li>
        <li>copy, resell or sublicense the software itself</li>
      </ul>

      <h2>7. Availability</h2>
      <p>
        We work to keep the service running and to keep your data safe, but we do not promise it
        will be available without interruption. Maintenance, a supplier&rsquo;s outage or a fault
        can take it offline. Where we plan an interruption we will give notice.
      </p>
      <p>
        Keep your own copy of anything you cannot afford to lose. The export exists for that
        reason.
      </p>

      <h2>8. Liability</h2>
      <p>
        We provide the software as it is. To the extent the law allows, we are not liable for
        losses arising from decisions taken on figures the software produced, from data entered
        incorrectly, from a lapse in your own record-keeping, or from an interruption to the
        service. Nothing here limits liability that cannot lawfully be limited.
      </p>
      <p>
        Where we are at fault, our liability is limited to the subscription fees the school paid
        in the twelve months before the claim.
      </p>

      <h2>9. Ending the arrangement</h2>
      <p>
        A school may stop using Zaroda at any time. We may suspend or end an account that breaches
        these terms, that is used to reach data it has no right to, or that puts other
        schools&rsquo; data at risk — and where we do, we will say why and give you your data.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        If we change these terms we will change the date at the top and tell schools by email
        where the change matters. Continuing to use the system after that means accepting the
        change.
      </p>

      <h2>11. Law</h2>
      <p>
        These terms are governed by the laws of Kenya, and the courts of Kenya have jurisdiction.
      </p>

      <h2>Contact</h2>
      <p>
        ZARODA Solutions<br />
        <a href="mailto:support@zarodasolutions.app">support@zarodasolutions.app</a><br />
        +254 781 230 805
      </p>
    </>
  );
}
