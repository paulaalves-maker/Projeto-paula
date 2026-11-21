import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, FileSpreadsheet, Keyboard, Warehouse } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user')) {
        setErrorMsg('Login cancelado antes da conclusão.');
      } else {
        setErrorMsg('Não foi possível autenticar com o Google. Tente novamente.');
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-8 space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Warehouse className="w-5 h-5 text-blue-700 shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight">Depósito 14</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight text-balance">
            Controle de Itens Vencidos
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Registre produtos vencidos digitando diretamente os campos ou extraindo em lote a partir
            de planilhas Excel e CSV, com histórico seguro na nuvem.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Keyboard className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Cadastro Manual</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Descrição, unidade, lote, validade, saldo atual e rua/palete com salvamento rápido.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Extração de Planilha</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Leitura automática de arquivos .xlsx, .xls e .csv com mapeamento inteligente de colunas.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
          >
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <span>{loading ? 'Conectando...' : 'Entrar com conta Google'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
          <p className="text-xs text-slate-500 text-center">
            Os registros do Depósito 14 ficam vinculados à sua conta autenticada.
          </p>
        </div>
      </div>
    </div>
  );
}
