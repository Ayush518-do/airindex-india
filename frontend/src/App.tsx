import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/dashboard/summary');
        setData(res.data);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (error) return <div className="flex items-center justify-center h-screen text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-indigo-600">AIRINDEX INDIA</h1>
          <p className="text-sm text-gray-600">Real-Time Airfare Price Intelligence Platform</p>
          {data?.data_mode && (
            <div className="mt-2 text-xs font-semibold text-red-600 bg-red-100 inline-block px-3 py-1 rounded">
              {data.data_mode}
            </div>
          )}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-gray-600 text-sm font-semibold mb-2">Airfare Index</h3>
            <p className="text-4xl font-bold text-indigo-600">{data?.current_index.toFixed(1)}</p>
            <p className="text-sm text-green-600 mt-2">+{data?.index_change.toFixed(1)}% change</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-gray-600 text-sm font-semibold mb-2">Routes Covered</h3>
            <p className="text-4xl font-bold text-blue-600">{data?.routes_covered}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-gray-600 text-sm font-semibold mb-2">Airlines</h3>
            <p className="text-4xl font-bold text-purple-600">{data?.airlines_covered}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-gray-600 text-sm font-semibold mb-2">Data Quality</h3>
            <p className="text-4xl font-bold text-green-600">{(data?.data_quality_score * 100).toFixed(0)}%</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Platform Status</h2>
          <p className="text-gray-600 mb-4">Welcome to AIRINDEX INDIA - a real-time airfare price index platform for India.</p>
          <p className="text-sm text-gray-500">Last Updated: {data?.last_updated}</p>
          <p className="text-sm text-gray-500">Total Observations: {data?.observations_count}</p>
        </div>
      </div>
    </div>
  );
}

export default App;
