import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type DialogTone = 'primary' | 'danger' | 'warn' | 'ok';

export interface AlertDialogOptions {
  eyebrow?: string;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: DialogTone;
  icon?: string;
}

export interface ConfirmDialogOptions {
  eyebrow?: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  icon?: string;
}

export interface PromptDialogOptions {
  eyebrow?: string;
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: 'text' | 'password';
  multiline?: boolean;
  required?: boolean;
  minLength?: number;
  requiredMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  icon?: string;
}

type DialogQueueItem =
  | {
      kind: 'alert';
      options: AlertDialogOptions;
      resolve: () => void;
    }
  | {
      kind: 'confirm';
      options: ConfirmDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'prompt';
      options: PromptDialogOptions;
      resolve: (value: string | null) => void;
    };

interface DialogContextValue {
  showAlert: (options: AlertDialogOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmDialogOptions | string) => Promise<boolean>;
  showPrompt: (options: PromptDialogOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

const DEFAULT_ICONS: Record<DialogTone, string> = {
  primary: 'info',
  danger: 'error',
  warn: 'warning',
  ok: 'check_circle',
};

const TONE_DEFAULT_EYEBROW: Record<DialogTone, string> = {
  primary: 'Information O.I.D',
  danger: 'Alerte système',
  warn: 'Confirmation requise',
  ok: 'Validation',
};

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queueRef = useRef<DialogQueueItem[]>([]);
  const [active, setActive] = useState<DialogQueueItem | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  const enqueue = useCallback((item: DialogQueueItem) => {
    const wasEmpty = queueRef.current.length === 0;
    queueRef.current.push(item);
    if (wasEmpty) {
      setInputError(null);
      setShowPassword(false);
      setInputValue(item.kind === 'prompt' ? item.options.defaultValue ?? '' : '');
      setActive(item);
    }
  }, []);

  const showAlert = useCallback(
    (options: AlertDialogOptions | string) =>
      new Promise<void>((resolve) => {
        const normalized: AlertDialogOptions =
          typeof options === 'string'
            ? { title: 'Notification', message: options, tone: 'primary' }
            : options;
        enqueue({ kind: 'alert', options: normalized, resolve });
      }),
    [enqueue]
  );

  const showConfirm = useCallback(
    (options: ConfirmDialogOptions | string) =>
      new Promise<boolean>((resolve) => {
        const normalized: ConfirmDialogOptions =
          typeof options === 'string'
            ? { title: 'Confirmer l’action', message: options, tone: 'warn' }
            : options;
        enqueue({ kind: 'confirm', options: normalized, resolve });
      }),
    [enqueue]
  );

  const showPrompt = useCallback(
    (options: PromptDialogOptions) =>
      new Promise<string | null>((resolve) => {
        enqueue({ kind: 'prompt', options, resolve });
      }),
    [enqueue]
  );

  // Gère le focus à l'ouverture et à la fermeture de la boîte de dialogue
  useEffect(() => {
    if (!active) {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
      return;
    }

    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    if (active.kind === 'prompt') {
      const timer = window.setTimeout(() => {
        if (active.options.multiline) {
          textareaRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 20);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [active]);

  const advanceQueue = useCallback(() => {
    queueRef.current.shift();
    const upcoming = queueRef.current[0] ?? null;
    setInputError(null);
    setShowPassword(false);
    setInputValue(upcoming?.kind === 'prompt' ? upcoming.options.defaultValue ?? '' : '');
    setActive(upcoming);
  }, []);

  const dismissActive = useCallback(() => {
    const current = queueRef.current[0];
    if (!current) return;
    if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'confirm') current.resolve(false);
    else current.resolve(null);
    advanceQueue();
  }, [advanceQueue]);

  const submitActive = useCallback(() => {
    const current = queueRef.current[0];
    if (!current) return;

    if (current.kind === 'alert') {
      current.resolve();
      advanceQueue();
      return;
    }

    if (current.kind === 'confirm') {
      current.resolve(true);
      advanceQueue();
      return;
    }

    // Mode prompt : validation avant résolution
    const trimmed = inputValue.trim();
    const { required = true, minLength, requiredMessage } = current.options;

    if (required && !trimmed) {
      setInputError(requiredMessage || 'Ce champ est requis pour continuer.');
      if (current.options.multiline) textareaRef.current?.focus();
      else inputRef.current?.focus();
      return;
    }

    if (minLength && trimmed.length < minLength) {
      setInputError(
        requiredMessage || `Veuillez saisir au moins ${minLength} caractères (${trimmed.length}/${minLength}).`
      );
      if (current.options.multiline) textareaRef.current?.focus();
      else inputRef.current?.focus();
      return;
    }

    current.resolve(trimmed);
    advanceQueue();
  }, [advanceQueue, inputValue]);

  // Fermeture par touche Échap
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissActive();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, dismissActive]);

  const tone: DialogTone =
    active?.options.tone ?? (active?.kind === 'confirm' ? 'warn' : 'primary');

  const iconName =
    active?.options.icon ??
    (active?.kind === 'confirm' && !active.options.tone
      ? 'help'
      : active?.kind === 'prompt'
      ? 'edit_note'
      : DEFAULT_ICONS[tone]);

  const eyebrow = active?.options.eyebrow ?? TONE_DEFAULT_EYEBROW[tone];

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {active &&
        createPortal(
          <div
            className="oid-dlg-backdrop"
            onClick={dismissActive}
            role="presentation"
          >
            <div
              className={`oid-dlg is-${tone}`}
              role={active.kind === 'prompt' ? 'dialog' : 'alertdialog'}
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={active.options.message ? descId : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="oid-dlg-accent" aria-hidden="true" />

              <div className="oid-dlg-head">
                <div className="oid-dlg-head-main">
                  <div className="oid-dlg-ico" aria-hidden="true">
                    <span className="material-symbols-outlined">{iconName}</span>
                  </div>
                  <div className="oid-dlg-titles">
                    <span className="oid-dlg-eyebrow">{eyebrow}</span>
                    <h2 id={titleId} className="oid-dlg-title">
                      {active.options.title}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  className="oid-dlg-close"
                  onClick={dismissActive}
                  aria-label="Fermer la fenêtre"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>

              <div className="oid-dlg-body">
                {active.options.message && (
                  <p id={descId} className="oid-dlg-msg">
                    {active.options.message}
                  </p>
                )}

                {active.kind === 'prompt' && (
                  <form
                    className="oid-dlg-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitActive();
                    }}
                  >
                    {active.options.label && (
                      <label className="oid-dlg-label" htmlFor={`${titleId}-input`}>
                        {active.options.label}
                      </label>
                    )}

                    {active.options.multiline ? (
                      <textarea
                        ref={textareaRef}
                        id={`${titleId}-input`}
                        rows={3}
                        className={`oid-dlg-textarea${inputError ? ' is-error' : ''}`}
                        value={inputValue}
                        placeholder={active.options.placeholder}
                        aria-invalid={Boolean(inputError)}
                        aria-describedby={inputError ? errorId : undefined}
                        onChange={(e) => {
                          setInputValue(e.target.value);
                          if (inputError) setInputError(null);
                        }}
                      />
                    ) : (
                      <div className="oid-dlg-input-wrap">
                        <input
                          ref={inputRef}
                          id={`${titleId}-input`}
                          type={
                            active.options.inputType === 'password' && !showPassword
                              ? 'password'
                              : 'text'
                          }
                          className={`oid-dlg-input${
                            active.options.inputType === 'password' ? ' has-eye' : ''
                          }${inputError ? ' is-error' : ''}`}
                          value={inputValue}
                          placeholder={active.options.placeholder}
                          autoComplete={
                            active.options.inputType === 'password' ? 'new-password' : 'off'
                          }
                          aria-invalid={Boolean(inputError)}
                          aria-describedby={inputError ? errorId : undefined}
                          onChange={(e) => {
                            setInputValue(e.target.value);
                            if (inputError) setInputError(null);
                          }}
                        />
                        {active.options.inputType === 'password' && (
                          <button
                            type="button"
                            className="oid-dlg-eye"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                              showPassword
                                ? 'Masquer le mot de passe'
                                : 'Afficher le mot de passe'
                            }
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {showPassword ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {inputError && (
                      <div id={errorId} className="oid-dlg-err" role="alert">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          error
                        </span>
                        <span>{inputError}</span>
                      </div>
                    )}
                  </form>
                )}
              </div>

              <div className="oid-dlg-foot">
                {active.kind !== 'alert' && (
                  <button
                    type="button"
                    className="oid-dlg-btn oid-dlg-btn-cancel"
                    onClick={dismissActive}
                  >
                    {active.options.cancelLabel ?? 'Annuler'}
                  </button>
                )}
                <button
                  ref={confirmBtnRef}
                  type="button"
                  className={`oid-dlg-btn oid-dlg-btn-confirm is-${tone}`}
                  onClick={submitActive}
                >
                  {active.options.confirmLabel ??
                    (active.kind === 'alert' ? 'Compris' : 'Confirmer')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DialogContext.Provider>
  );
};

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
};
