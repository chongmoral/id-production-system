
import './App.css'

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">ID</div>
          <div>
            <h2>ID Production</h2>
            <p>Management System</p>
          </div>
        </div>

        <nav className="navigation">
          <p className="nav-label">WORKSPACE</p>
          <a className="nav-link active" href="#dashboard">Dashboard</a>
          <a className="nav-link" href="#orders">Orders</a>
          <a className="nav-link" href="#schedule">Schedule</a>
          <a className="nav-link" href="#production">Production</a>

          <p className="nav-label">MANAGEMENT</p>
          <a className="nav-link" href="#students">Student Records</a>
          <a className="nav-link" href="#inventory">Inventory</a>
          <a className="nav-link" href="#accounting">Accounting</a>
        </nav>

        <div className="sidebar-footer">
          <p>School ID Operations</p>
          <span>System Preview · v1.0</span>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">WORKSPACE / OVERVIEW</p>
            <h1>Dashboard</h1>
          </div>
          <div className="user-profile">
            <div className="avatar">OW</div>
            <div>
              <strong>System Owner</strong>
              <span>Administrator</span>
            </div>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">ID PRODUCTION MANAGEMENT</p>
            <h2>Welcome to your workspace.</h2>
            <p>Monitor school orders, production progress, and daily operations in one place.</p>
          </div>
          <div className="welcome-mark">ID</div>
        </section>

        <section className="section-heading">
          <div>
            <h2>Operations overview</h2>
            <p>Your key production and business indicators.</p>
          </div>
          <span className="demo-label">DEMO DATA</span>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Active Orders</span>
            <strong>0</strong>
            <span className="stat-note">Orders in progress</span>
          </article>

          <article className="stat-card">
            <span className="stat-label">IDs to Produce</span>
            <strong>0</strong>
            <span className="stat-note">Remaining production quantity</span>
          </article>

          <article className="stat-card">
            <span className="stat-label">Upcoming Deadlines</span>
            <strong>0</strong>
            <span className="stat-note">Orders requiring attention</span>
          </article>

          <article className="stat-card">
            <span className="stat-label">Unpaid Invoices</span>
            <strong>₱0.00</strong>
            <span className="stat-note">Outstanding balance</span>
          </article>
        </section>

        <section className="bottom-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <h2>Production pipeline</h2>
                <p>Track work through each production stage.</p>
              </div>
              <span className="status-dot">Preview</span>
            </div>

            <div className="pipeline">
              <div className="pipeline-stage">
                <span className="stage-number">01</span>
                <div><strong>Order & Design</strong><p>Order intake and layout approval</p></div>
                <span className="stage-count">0</span>
              </div>
              <div className="pipeline-stage">
                <span className="stage-number">02</span>
                <div><strong>Photo & Records</strong><p>Student details and photo matching</p></div>
                <span className="stage-count">0</span>
              </div>
              <div className="pipeline-stage">
                <span className="stage-number">03</span>
                <div><strong>Printing & Finishing</strong><p>Print, laminate, and cut IDs</p></div>
                <span className="stage-count">0</span>
              </div>
              <div className="pipeline-stage">
                <span className="stage-number">04</span>
                <div><strong>Sorting & Delivery</strong><p>Reconciliation and endorsement</p></div>
                <span className="stage-count">0</span>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <h2>Quick actions</h2>
                <p>Common tasks for the owner.</p>
              </div>
            </div>

            <div className="quick-actions">
              <a href="#orders" className="action-link">
                <span className="action-icon">＋</span>
                <span><strong>Create an order</strong><small>Register a new school project</small></span>
                <span className="action-arrow">→</span>
              </a>
              <a href="#schedule" className="action-link">
                <span className="action-icon">▦</span>
                <span><strong>View schedule</strong><small>Check upcoming photo sessions</small></span>
                <span className="action-arrow">→</span>
              </a>
              <a href="#inventory" className="action-link">
                <span className="action-icon">▤</span>
                <span><strong>Check inventory</strong><small>Review available materials</small></span>
                <span className="action-arrow">→</span>
              </a>
              <a href="#accounting" className="action-link">
                <span className="action-icon">₱</span>
                <span><strong>Review finances</strong><small>Track expenses and payments</small></span>
                <span className="action-arrow">→</span>
              </a>
            </div>
          </article>
        </section>

        <footer className="page-footer">
          <span>ID Production Management System</span>
          <span>Initial interface · No live business data yet</span>
        </footer>
      </main>
    </div>
  )
}

export default App
