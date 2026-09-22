export const metadata = {
  title: 'Privacy policy — Zaroda School Management System',
  description:
    'What Zaroda SMS collects about learners and staff, who is responsible for it, who else '
    + "sees it, and the rights you have under Kenya's Data Protection Act 2019.",
  alternates: { canonical: '/legal/privacy' },
};

const UPDATED = '22 September 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="sub">Last updated {UPDATED}</p>

      <p>
        Zaroda School Management System is run by <strong>ZARODA Solutions</strong>. This system
        holds information about children, so this policy is written plainly and in full. It says
        what is collected, who is answerable for it, who else can see it, how long it is kept and
        what you can require.
      </p>

      <h2>Who is answerable for what</h2>
      <p>
        This is the most important section, because the answer is not the same for all the
        information here.
      </p>
      <p>
        <strong>A school&rsquo;s records are the school&rsquo;s.</strong> Learners&rsquo; names,
        dates of birth, assessment results, attendance, discipline records, guardian contacts and
        everything else a school enters belong to that school. The school decides what is
        collected and why, so under the Data Protection Act 2019 <strong>the school is the data
        controller</strong> and ZARODA Solutions is its <strong>data processor</strong>. We hold
        and process this information on the school&rsquo;s instruction. We do not use it for any
        purpose of our own.
      </p>
      <p>
        <strong>Your ZARODA account is ours to answer for.</strong> The name, email address,
        telephone number and role used to sign in, together with the school&rsquo;s subscription
        and billing records. We decide what to do with these, so for this information{' '}
        <strong>we are the controller</strong>.
      </p>
      <p>
        In practice this means a parent asking about their child&rsquo;s record should ask the
        school first. The school can answer, and can require us to act. We will always help a
        school meet such a request.
      </p>

      <h2>What the system holds</h2>
      <table>
        <thead><tr><th>What</th><th>Why it is held</th></tr></thead>
        <tbody>
          <tr>
            <td>Learner name, admission number, UPI / assessment number</td>
            <td>To identify a learner across registers, marks and reports</td>
          </tr>
          <tr>
            <td>Date of birth, birth certificate number, gender, nationality</td>
            <td>Required for registration, KNEC entry and Ministry returns</td>
          </tr>
          <tr>
            <td>Guardian name, telephone, email, relationship, ID number</td>
            <td>To reach a parent, and to give them access to their child&rsquo;s portal</td>
          </tr>
          <tr>
            <td>Special educational and health needs</td>
            <td>So a school can make the adjustments a learner is entitled to</td>
          </tr>
          <tr>
            <td>Attendance, assessment results, competency levels, report cards</td>
            <td>The academic record itself</td>
          </tr>
          <tr>
            <td>Discipline incidents, counselling notes</td>
            <td>Kept by the school as part of its duty of care</td>
          </tr>
          <tr>
            <td>Fees, invoices, receipts, M-Pesa transaction records</td>
            <td>To bill fees and account for what was paid</td>
          </tr>
          <tr>
            <td>Staff name, role, TSC number, salary and payroll deductions</td>
            <td>To run the school&rsquo;s payroll and statutory returns</td>
          </tr>
          <tr>
            <td>Password</td>
            <td>Stored only as a bcrypt hash. We cannot read it and neither can anyone else</td>
          </tr>
          <tr>
            <td>An access log: who opened which learner&rsquo;s record, when, and from what address</td>
            <td>
              So a school can answer &ldquo;who saw this child&rsquo;s data?&rdquo; — a duty the
              Act places on it
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Some of this is <strong>sensitive personal data</strong> under section 2 of the Act —
        health and special needs in particular — and it concerns children. It is treated
        accordingly: reachable only by staff whose role requires it, and every opening of a
        learner&rsquo;s record is logged.
      </p>

      <h2>We do not sell anything, or advertise</h2>
      <p>
        We do not sell, rent or trade any of it. We do not advertise, we run no advertising
        trackers, and we build no profiles. We do not use a school&rsquo;s learner data to train
        any model. Zaroda earns its money from subscriptions and from nothing else.
      </p>

      <h2>Who else sees it</h2>
      <ul>
        <li>
          <strong>Staff at the school,</strong> according to the role it gives them. A subject
          teacher sees their own classes; a class teacher sees their class; school leadership sees
          the school. Finance is separate again. The boundary is enforced on the server, not
          merely hidden in the menus.
        </li>
        <li>
          <strong>A parent or guardian,</strong> who sees their own children and no one
          else&rsquo;s.
        </li>
        <li>
          <strong>ZARODA Solutions staff,</strong> only where it is necessary to support the
          school or to keep the service running.
        </li>
        <li>
          <strong>Our suppliers,</strong> listed below, each bound to process it only on our
          instruction.
        </li>
      </ul>
      <p>
        We do not hand a school&rsquo;s records to anybody else — including any government body —
        unless the school instructs it or the law compels us. Where we are compelled and are
        permitted to say so, we will tell the school.
      </p>

      <h2>Suppliers who process data for us</h2>
      <table>
        <thead><tr><th>Who</th><th>What they handle</th><th>Where</th></tr></thead>
        <tbody>
          <tr><td>Render</td><td>Runs the application and hosts the database</td><td>Frankfurt, Germany</td></tr>
          <tr><td>Safaricom (M-Pesa Daraja)</td><td>Fee and subscription payments</td><td>Kenya</td></tr>
          <tr><td>Tuma</td><td>M-Pesa collection for subscriptions</td><td>Kenya</td></tr>
          <tr><td>Africa&rsquo;s Talking</td><td>Sends SMS to parents and staff</td><td>Kenya</td></tr>
          <tr><td>Resend</td><td>Sends our email</td><td>Outside Kenya</td></tr>
          <tr><td>Anthropic</td><td>Generates schemes of work and lesson plans, on a teacher&rsquo;s request</td><td>Outside Kenya</td></tr>
        </tbody>
      </table>
      <p>
        <strong>The database is stored outside Kenya</strong>, in Frankfurt. The Data Protection
        Act 2019 permits transfer abroad where appropriate safeguards are in place; our suppliers
        are bound by contract to protect the data and to process it only on our instruction.
      </p>
      <p>
        Only what a teacher types into a scheme-of-work or lesson-plan request is sent to
        Anthropic. Learner names and records are not.
      </p>

      <h2>How long it is kept</h2>
      <p>
        A school sets its own retention periods, on its Data Protection page, within what the law
        allows. The defaults are:
      </p>
      <table>
        <thead><tr><th>What</th><th>Kept for</th></tr></thead>
        <tbody>
          <tr><td>Former learners&rsquo; personal details</td><td>7 years after they leave, then anonymised</td></tr>
          <tr><td>Attendance records</td><td>3 years</td></tr>
          <tr><td>Access and activity logs</td><td>2 years</td></tr>
          <tr><td>Academic results</td><td>Kept — a school is required to retain these</td></tr>
          <tr><td>Financial records</td><td>5 years, as the Kenya Revenue Authority requires</td></tr>
        </tbody>
      </table>
      <p>
        When a retention period runs out, a former learner&rsquo;s name, date of birth, birth
        certificate number, guardian contacts and health notes are{' '}
        <strong>permanently anonymised</strong> — not merely hidden. The academic results remain,
        because a school must keep them, but they no longer identify a child. This runs
        automatically each week.
      </p>

      <h2>What you can require</h2>
      <p>Under the Data Protection Act 2019 a data subject may ask to:</p>
      <ul>
        <li>be told what is held about them, and be given a copy</li>
        <li>have anything wrong corrected</li>
        <li>have it deleted, where there is no legal requirement to keep it</li>
        <li>object to how it is processed, or ask that processing stop</li>
        <li>have it handed over in a form they can take elsewhere</li>
      </ul>
      <p>
        <strong>For a learner&rsquo;s record, ask the school</strong> — it is the controller, and
        it holds the answer. For your ZARODA sign-in account, write to us at{' '}
        <a href="mailto:support@zarodasolutions.app">support@zarodasolutions.app</a>. Either way
        we answer within thirty days.
      </p>
      <p>
        Note that a school cannot lawfully destroy academic or financial records on request, and
        the system will refuse rather than pretend otherwise.
      </p>
      <p>
        If you are not satisfied, you may complain to the Office of the Data Protection
        Commissioner at <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">odpc.go.ke</a>.
      </p>

      <h2>Keeping it safe</h2>
      <ul>
        <li>Everything travels over HTTPS</li>
        <li>Passwords are stored as bcrypt hashes, never in a readable form</li>
        <li>Each school reaches only its own records; the boundary is enforced on the server</li>
        <li>What a member of staff can see is limited to what their role requires</li>
        <li>Every opening of a learner&rsquo;s record is written to an access log the school can read</li>
        <li>Sign-in attempts are rate limited, to stop password guessing</li>
      </ul>
      <p>
        No system is perfect. If something goes wrong that puts personal data at risk, we will
        tell the affected schools and the Data Protection Commissioner within 72 hours, as the Act
        requires.
      </p>

      <h2>Cookies</h2>
      <p>
        One, to keep you signed in. No advertising or analytics cookies of any kind.
      </p>

      <h2>Children</h2>
      <p>
        This system exists to hold school records, so it necessarily holds information about
        children. It does so on the instruction of the school, which is responsible for having a
        lawful basis — usually its legitimate function as a school, and parental consent where
        the Act requires it. Learner portal accounts are created by the school, never by a child
        signing up.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy we will change the date at the top, and tell schools by email
        where the change matters.
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
