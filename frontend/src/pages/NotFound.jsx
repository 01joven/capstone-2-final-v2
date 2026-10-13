import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

const NotFound = () => (
  <Layout>
    <div className="page-container" style={{ textAlign: 'center', padding: '48px 16px' }}>
      <h1 className="page-title">Page not found</h1>
      <p>The page you are looking for does not exist or was moved.</p>
      <Link to="/" className="btn btn-primary">Go home</Link>
    </div>
  </Layout>
);

export default NotFound;
