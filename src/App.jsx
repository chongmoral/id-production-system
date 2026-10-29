
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './App.css';
import SchoolsPage from './components/SchoolsPage';
import OrdersPage from './components/OrdersPage';
import SchedulesPage from './components/SchedulesPage';
import StudentRecordsPage from './components/StudentRecordsPage';
import PhotoVerificationPage from './components/PhotoVerificationPage';
import ProductionBatchesPage from './components/ProductionBatchesPage';
import ReprintsPage from './components/ReprintsPage';
import EndorsementsPage from './components/EndorsementsPage';
import InventoryPage from './components/InventoryPage';
import InvoicesPaymentsPage from './components/InvoicesPaymentsPage';
import ExpensesReportsPage from './components/ExpensesReportsPage';
import UserManagementPage from './components/UserManagementPage';

function App() {
  const [session, setSession] = useState(null);
  const [activePage, setActivePage] = useState('Dashboard');
  const [profile, setProfile] = useState(null);

  const [totalOrders, setTotalOrders] = useState(null);
  const [inProduction, setInProduction] = useState(null);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState(null);
  const [unpaidInvoices, setUnpaidInvoices] = useState(null);

  const [profileError, setProfileError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  

const navigationGroups = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', icon: '' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Schools & Clients', icon: '' },
      { name: 'Orders & Deadlines', icon: '' },
      { name: 'Schedules', icon: '' },
    ],
  },
  {
    label: 'Production',
    items: [
      { name: 'Student Records', icon: '' },
      { name: 'Photo Verification', icon: '' },
      { name: 'Production Batches', icon: '' },
      { name: 'Reprints', icon: '' },
      { name: 'Endorsements', icon: '' },
    ],
  },
  {
    label: 'Resources & Finance',
    items: [
      { name: 'Inventory', icon: '' },
      ...(profile?.role === 'owner' || profile?.role === 'accountant'
        ? [
            { name: 'Invoices & Payments', icon: '' },
            { name: 'Expenses & Reports', icon: '' },
          ]
        : []),
    ],
  },
  ...(profile?.role === 'owner'
    ? [
        {
          label: 'Administration',
          items: [
            { name: 'User Management', icon: '' },
          ],
        },
      ]
    : []),
];



  async function loadProfile(userId) {
    setProfileError('');

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single();

    if (error) {
      setProfile(null);
      setProfileError(error.message);
      return;
    }

    setProfile(data);
  }

  async function loadTotalOrders() {
    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    setTotalOrders(count ?? 0);
  }

  async function loadInProduction() {
    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', [
        'design',
        'photo_collection',
        'printing',
        'finishing',
        'sorting',
      ]);

    if (error) throw error;

    setInProduction(count ?? 0);
  }

  async function loadUpcomingDeadlines() {
    // Use local calendar dates to avoid UTC date shifts.
    const formatLocalDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const sevenDaysLater = new Date();

    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('deadline', formatLocalDate(today))
      .lte('deadline', formatLocalDate(sevenDaysLater))
      .not('status', 'in', '(completed,cancelled)');

    if (error) throw error;

    setUpcomingDeadlines(count ?? 0);
  }

  async function loadUnpaidInvoices() {
    // Only count invoices that have been issued and are awaiting payment.
    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, total_amount, status')
      .in('status', ['issued', 'partially_paid', 'overdue']);

    if (invoiceError) throw invoiceError;

    if (!invoices || invoices.length === 0) {
      setUnpaidInvoices(0);
      return;
    }

    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('invoice_id, amount');

    if (paymentError) throw paymentError;

    const paidByInvoice = {};

    for (const payment of payments ?? []) {
      const invoiceId = payment.invoice_id;

      paidByInvoice[invoiceId] =
        (paidByInvoice[invoiceId] ?? 0) + Number(payment.amount || 0);
    }

    const outstandingBalance = invoices.reduce((total, invoice) => {
      const invoiceTotal = Number(invoice.total_amount || 0);
      const paid = paidByInvoice[invoice.id] ?? 0;
      const balance = Math.max(0, invoiceTotal - paid);

      return total + balance;
    }, 0);

    setUnpaidInvoices(outstandingBalance);
  }

  async function loadDashboardData() {
  setRefreshing(true);
  setDashboardError('');

  try {
    await Promise.all([
      loadTotalOrders(),
      loadInProduction(),
      loadUpcomingDeadlines(),
      loadUnpaidInvoices(),
    ]);
  } catch (err) {
    console.error('Dashboard loading error:', err);
    setDashboardError(
      'Some dashboard data could not be loaded. Please try again.'
    );
  } finally {
    setRefreshing(false);
  }
}

  useEffect(() => {
    let active = true;

    async function initializeSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        setError(error.message);
      }

      const currentSession = data?.session ?? null;
      setSession(currentSession);

      if (currentSession) {
        await loadProfile(currentSession.user.id);

        if (active) {
          await loadDashboardData();
        }
      }

      if (active) {
        setCheckingSession(false);
      }
    }

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;

      setSession(newSession);
      setError('');

      if (!newSession) {
        setProfile(null);
        setProfileError('');
        setDashboardError('');

        setTotalOrders(null);
        setInProduction(null);
        setUpcomingDeadlines(null);
        setUnpaidInvoices(null);
      } else {
        // Defer database queries until the auth callback has completed.
        setTimeout(() => {
          if (!active) return;

          loadProfile(newSession.user.id);
          loadDashboardData();
        }, 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setError(error.message);
    }
  }

  if (checkingSession) {
    return <p className="loading-message">Checking session...</p>;
  }

  
if (session) {
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="login-brand">
          <div className="login-logo">ID</div>
          <div>
            <h1>ID Production</h1>
            <p>Management System</p>
          </div>
        </div>

        <button className="logout-button" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <p className="sidebar-label">{group.label}</p>

              <nav className="sidebar-nav">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`sidebar-link ${
                      activePage === item.name ? 'active' : ''
                    }`}
                    onClick={() => setActivePage(item.name)}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          ))}
        </aside>

        <div className="dashboard-main">
          <div className="dashboard-content">
            {activePage === 'Dashboard' ? (
              <>
                <section>
                  <h2 className="dashboard-title">
                    Welcome, {profile?.full_name || 'User'}!
                  </h2>

                  <p className="dashboard-subtitle">
                    Here's an overview of your ID production operations.
                  </p>

                  <p className="dashboard-subtitle">
                    Signed in as{' '}
                    {profile?.role?.replace('_', ' ') || 'Loading role...'}
                  </p>

                  {profileError && (
                    <p className="login-error">
                      Unable to load your profile: {profileError}
                    </p>
                  )}
                </section>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
  <button
  type="button"
  className="logout-button"
  onClick={loadDashboardData}
  disabled={refreshing}
>
  {refreshing ? 'Refreshing...' : 'Refresh Dashboard'}
</button>
</div>

                {dashboardError && (
                  <section className="dashboard-panel">
                    <p className="login-error">{dashboardError}</p>
                    <button
                      className="logout-button"
                      onClick={loadDashboardData}
                    >
                      Retry loading data
                    </button>
                  </section>
                )}

                <section className="dashboard-metrics">
                  <article className="metric-card">
                    <p className="metric-label">Total Orders</p>
                    <p className="metric-value">
                      {totalOrders === null ? '...' : totalOrders}
                    </p>
                  </article>

                  <article className="metric-card">
                    <p className="metric-label">In Production</p>
                    <p className="metric-value">
                      {inProduction === null ? '...' : inProduction}
                    </p>
                  </article>

                  <article className="metric-card">
                    <p className="metric-label">
                      Upcoming Deadlines (7 Days)
                    </p>
                    <p className="metric-value">
                      {upcomingDeadlines === null
                        ? '...'
                        : upcomingDeadlines}
                    </p>
                  </article>

                  <article className="metric-card">
                    <p className="metric-label">Unpaid Invoices</p>
                    <p className="metric-value">
                      {unpaidInvoices === null
                        ? '...'
                        : `₱${unpaidInvoices.toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`}
                    </p>
                  </article>
                </section>

                <section className="dashboard-panel">
                  <h3>Production Overview</h3>
                  <p className="dashboard-subtitle">
                    Order tracking, production progress, inventory, and
                    financial summaries will appear here.
                  </p>
                </section>
              </>
            ) : activePage === 'Schools & Clients' ? (
  <SchoolsPage userRole={profile?.role} />
) : activePage === 'Orders & Deadlines' ? (
  <OrdersPage userRole={profile?.role} />
) : activePage === 'Schedules' ? (
  <SchedulesPage userRole={profile?.role} />
) : activePage === 'Student Records' ? (
   <StudentRecordsPage userRole={profile?.role} />
) : activePage === 'Photo Verification' ? (
   <PhotoVerificationPage userRole={profile?.role} />
) : activePage === 'Production Batches' ? (
  <ProductionBatchesPage userRole={profile?.role} />
) : activePage === 'Reprints' ? (
  <ReprintsPage userRole={profile?.role} />
)  : activePage === 'Endorsements' ? (
    <EndorsementsPage userRole={profile?.role} />
) : activePage === 'Inventory' ? (
  <InventoryPage userRole={profile?.role} />
) : activePage === 'Invoices & Payments' ? (
  <InvoicesPaymentsPage userRole={profile?.role} />
) : activePage === 'Expenses & Reports' ? (
  <ExpensesReportsPage userRole={profile?.role} />
  ) : activePage === 'User Management' ? (
  <UserManagementPage userRole={profile?.role} />
) : (


  
  <section>
    <h2 className="dashboard-title">{activePage}</h2>
    <p className="dashboard-subtitle">
      This section is planned but has not been implemented yet.
      We'll build and connect it to Supabase in the next steps.
    </p>
  </section>
)}
          </div>
        </div>
      </div>
    </main>
  );
}


  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-logo">ID</div>
          <div>
            <h1>ID Production</h1>
            <p>Management System</p>
          </div>
        </div>

        <div className="login-heading">
          <h2>Welcome back</h2>
          <p>Sign in to manage your production operations.</p>
        </div>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="login-footer">Authorized personnel only</p>
      </section>
    </main>
  );
}

export default App;
