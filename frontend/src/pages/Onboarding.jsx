import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Onboarding.css';

const steps = [
  {
    title: 'Welcome to Memorial Map!',
    description: 'Your journey to preserving memories and mapping history starts here. Let us show you around.',
    icon: '👋',
  },
  {
    title: 'How to Use',
    description: 'Explore memorial sites on the map, search by category, save your favorites, and book reservations easily.',
    icon: '📖',
    features: [
      { icon: '🗺️', label: 'Browse the Map' },
      { icon: '🔍', label: 'Search Sites' },
      { icon: '❤️', label: 'Save Favorites' },
      { icon: '📅', label: 'Make Reservations' },
    ],
  },
  {
    title: 'Start Exploring!',
    description: 'You are all set! Head to your dashboard and begin discovering memorial sites near you.',
    icon: '🚀',
  },
];

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      await userAPI.completeOnboarding();
      updateUser({ ...JSON.parse(localStorage.getItem('user')), onboarding_completed: true });
      navigate('/dashboard');
    }
  };

  const current = steps[step];

  return (
    <div className="onboarding-page">
      <div className="onboarding-card card">
        <div className="onboarding-steps">
          {steps.map((_, i) => (
            <div key={i} className={`step-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-icon">{current.icon}</div>
        <h2>{current.title}</h2>
        <p>{current.description}</p>

        {current.features && (
          <div className="onboarding-features">
            {current.features.map((f) => (
              <div key={f.label} className="onboarding-feature">
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="btn btn-outline" onClick={() => setStep(step - 1)}>Back</button>
          )}
          <button className="btn btn-primary" onClick={handleNext}>
            {step === steps.length - 1 ? 'Go to Dashboard' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
