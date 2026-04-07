import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import OnboardingFlow from "@/components/OnboardingFlow";
import ChatApp from "@/components/ChatApp";
import { UserProfile, getProfile, saveProfile } from "@/lib/userProfile";

export default function Index() {
  const [profile, setProfile] = useState<UserProfile>(getProfile());
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const p = getProfile();
    setProfile(p);
    if (!p.onboardingDone) {
      setShowOnboarding(true);
    }
    // Request push notification permission
    if ("Notification" in window && Notification.permission === "default") {
      setTimeout(() => Notification.requestPermission(), 3000);
    }
  }, []);

  const handleOnboardingComplete = (p: UserProfile) => {
    setProfile(p);
    setShowOnboarding(false);
  };

  const handleProfileUpdate = (p: UserProfile) => {
    saveProfile(p);
    setProfile(p);
  };

  return (
    <>
      <AnimatePresence>
        {showOnboarding && <OnboardingFlow onComplete={handleOnboardingComplete} />}
      </AnimatePresence>
      <ChatApp profile={profile} onProfileUpdate={handleProfileUpdate} />
    </>
  );
}
