import { useNavigate } from 'react-router-dom';
import logoAnalysis from '../assets/logo_analysis.png';
import logoBrain from '../assets/logo_brain.png';

const features = [
  { key: 'analytics', title: 'PBN Analytics', image: logoAnalysis, gradient: 'from-emerald-400 via-emerald-500 to-emerald-600', subtitle: 'Upload, clean, export', path: '/pbn-analytics' },
  { key: 'insights', title: 'Insight Hub', image: logoBrain, gradient: 'from-sky-400 via-sky-500 to-indigo-500', subtitle: 'PBN Open + Edu + HB dashboard', path: '/insights' },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 text-slate-100 px-6 py-10">
      <div className="max-w-4xl w-full text-center">
        <div className="mb-12">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-500 mb-3">Welcome</p>
          <h1 className="text-4xl md:text-5xl font-semibold text-white">What would you like to do today?</h1>
          <p className="mt-4 text-slate-400 max-w-2xl mx-auto">Clean and analyze your PBN datasets.</p>
        </div>

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <button
              key={feature.key}
              type="button"
              onClick={() => navigate(feature.path)}
              className="group flex flex-col items-center justify-center rounded-3xl px-6 py-10 text-center transition cursor-pointer"
            >
              <div className={`mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${feature.gradient} shadow-lg shadow-slate-950/20 transition group-hover:-translate-y-1`}>
                <img src={feature.image} alt={`${feature.title} logo`} className="h-12 w-12 object-contain" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
                <p className="text-sm text-slate-400">{feature.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
