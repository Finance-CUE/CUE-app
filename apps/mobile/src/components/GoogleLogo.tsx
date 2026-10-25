import Svg, {
  Path,
} from 'react-native-svg';

interface GoogleLogoProps {
  size?: number;
}

export function GoogleLogo({ size = 22 }: GoogleLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M21.35 12.23c0-.79-.07-1.55-.22-2.28H12v4.32h5.24a4.48 4.48 0 0 1-1.95 2.94v2.45h3.15c1.85-1.7 2.91-4.2 2.91-7.43Z"
      />
      <Path
        fill="#34A853"
        d="M12 21.8c2.65 0 4.87-.88 6.49-2.38l-3.15-2.45c-.88.59-2.01.94-3.34.94-2.56 0-4.73-1.73-5.51-4.06H3.23v2.53A9.8 9.8 0 0 0 12 21.8Z"
      />
      <Path
        fill="#FBBC05"
        d="M6.49 13.85A5.9 5.9 0 0 1 6.18 12c0-.64.11-1.26.31-1.85V7.62H3.23A9.8 9.8 0 0 0 2.2 12c0 1.58.38 3.07 1.03 4.38l3.26-2.53Z"
      />
      <Path
        fill="#EA4335"
        d="M12 6.09c1.44 0 2.73.5 3.75 1.49l2.81-2.81C16.87 3.16 14.65 2.2 12 2.2a9.8 9.8 0 0 0-8.77 5.42l3.26 2.53C6.27 7.82 8.44 6.09 12 6.09Z"
      />
    </Svg>
  );
}