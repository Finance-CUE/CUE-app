import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

export function CueBrandVisual() {
  return (
    <LinearGradient
      colors={['#8D80CC', '#B695C8', '#E6A07E']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.container}
    >
      <View style={styles.orbitLarge} />
      <View style={styles.orbitSmall} />

      <View style={styles.clock}>
        <View style={styles.minuteHand} />
        <View style={styles.hourHand} />
      </View>

      <View style={styles.dotOne} />
      <View style={styles.dotTwo} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 174,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  orbitLarge: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    bottom: -210,
    left: -80,
  },

  orbitSmall: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    bottom: -155,
    left: 30,
  },

  clock: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  minuteHand: {
    position: 'absolute',
    width: 2.5,
    height: 20,
    backgroundColor: '#FFFFFF',
    bottom: '49%',
    borderRadius: 2,
  },

  hourHand: {
    position: 'absolute',
    width: 2.5,
    height: 20,
    backgroundColor: '#FFFFFF',
    bottom: '20%',
    right: '35%',
    borderRadius: 2,
    transform: [{ rotate: '135deg' }],
  },

  dotOne: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.65)',
    top: 36,
    left: 80,
  },

  dotTwo: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
    bottom: 35,
    right: 70,
  },
});