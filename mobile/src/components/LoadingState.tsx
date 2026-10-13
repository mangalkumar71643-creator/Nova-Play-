import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export default function LoadingState() {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.gold} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
