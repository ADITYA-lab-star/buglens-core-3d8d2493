import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  fetchSignInMethodsForEmail,
  AuthError,
} from "firebase/auth";
import { auth, googleProvider, githubProvider } from "../lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const handleAccountExistsError = async (error: unknown, email?: string | null) => {
    const authError = error as AuthError;
    if (authError.code === "auth/account-exists-with-different-credential") {
      const targetEmail = email || authError.customData?.email as string | undefined;
      
      if (targetEmail) {
        const methods = await fetchSignInMethodsForEmail(auth, targetEmail);
        throw new Error(
          `An account already exists with the same email address but different sign-in credentials. Please sign in using one of the following methods to link your accounts: ${methods.join(
            ", "
          )}`
        );
      }
    }
    throw error;
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      await handleAccountExistsError(error);
    }
  };

  const loginWithGithub = async () => {
    try {
      await signInWithPopup(auth, githubProvider);
    } catch (error: any) {
      // Github auth might not return the email in customData depending on scope,
      // but usually the error code is sufficient to trigger the handler.
      await handleAccountExistsError(error, error?.customData?.email);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    user,
    loading,
    signUpWithEmail,
    loginWithEmail,
    loginWithGoogle,
    loginWithGithub,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Global helper to get the ID token for backend API requests
export const getIdToken = async (): Promise<string | null> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return null;
  }
  try {
    return await currentUser.getIdToken(true);
  } catch (error) {
    console.error("Error fetching ID token:", error);
    return null;
  }
};
