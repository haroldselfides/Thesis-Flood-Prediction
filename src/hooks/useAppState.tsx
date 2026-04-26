"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import type {
  AppState,
  PredictionWindow,
  SpatialLayerId,
  FacilityLayerId,
  PredictionResponse,
} from "@/types";
import { LEGAZPI_CENTER } from "@/lib/constants";

// Initial state
const initialState: AppState = {
  predictionWindow: "1h",
  visibleLayers: [],
  visibleFacilities: [],
  mapView: { center: LEGAZPI_CENTER, zoom: 13 },
  sidebar: { isOpen: true, activeTab: "layers" },
  selectedBarangay: null,
  prediction: null,
  isLoading: false,
  isPredicting: false,
};

// Actions
type Action =
  | { type: "SET_PREDICTION_WINDOW"; payload: PredictionWindow }
  | { type: "TOGGLE_LAYER"; payload: SpatialLayerId }
  | { type: "SET_LAYER_VISIBILITY"; payload: { id: SpatialLayerId; visible: boolean } }
  | { type: "TOGGLE_FACILITY"; payload: FacilityLayerId }
  | { type: "SET_SIDEBAR_TAB"; payload: AppState["sidebar"]["activeTab"] }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SELECT_BARANGAY"; payload: string | null }
  | { type: "SET_PREDICTION"; payload: PredictionResponse | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_PREDICTING"; payload: boolean }
  | { type: "SET_MAP_VIEW"; payload: { center: [number, number]; zoom: number } };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PREDICTION_WINDOW":
      return { ...state, predictionWindow: action.payload };

    case "TOGGLE_LAYER": {
      const layers = state.visibleLayers.includes(action.payload)
        ? state.visibleLayers.filter((l) => l !== action.payload)
        : [...state.visibleLayers, action.payload];
      return { ...state, visibleLayers: layers };
    }

    case "SET_LAYER_VISIBILITY": {
      const { id, visible } = action.payload;
      const layers = visible
        ? [...state.visibleLayers.filter((l) => l !== id), id]
        : state.visibleLayers.filter((l) => l !== id);
      return { ...state, visibleLayers: layers };
    }

    case "TOGGLE_FACILITY": {
      const facilities = state.visibleFacilities.includes(action.payload)
        ? state.visibleFacilities.filter((f) => f !== action.payload)
        : [...state.visibleFacilities, action.payload];
      return { ...state, visibleFacilities: facilities };
    }

    case "SET_SIDEBAR_TAB":
      return {
        ...state,
        sidebar: { ...state.sidebar, activeTab: action.payload, isOpen: true },
      };

    case "TOGGLE_SIDEBAR":
      return {
        ...state,
        sidebar: { ...state.sidebar, isOpen: !state.sidebar.isOpen },
      };

    case "SELECT_BARANGAY":
      return { ...state, selectedBarangay: action.payload };

    case "SET_PREDICTION":
      return { ...state, prediction: action.payload };

    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "SET_PREDICTING":
      return { ...state, isPredicting: action.payload };

    case "SET_MAP_VIEW":
      return { ...state, mapView: action.payload };

    default:
      return state;
  }
}

// Context
const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<React.Dispatch<Action>>(() => {});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}