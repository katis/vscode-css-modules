import styles from '#components/Card.module.css';
import local from './Button.module.css';

export function Button() {
  return <button className={styles.primaryAction} />;
}

export function ButtonDanger() {
  return <button className={local.danger} />;
}

export function ButtonGlobal() {
  return <button className={styles.globalClass} />;
}
