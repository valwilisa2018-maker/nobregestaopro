import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "CRITICAL";

interface LogOptions {
  details?: any;
  context?: string;
  silent?: boolean; // If true, won't show a toast
  userId?: string;
}

class Logger {
  private async saveLog(level: LogLevel, message: string, options?: LogOptions) {
    let { details, context, userId } = options || {};
    
    // Auto-fill userId if not provided
    if (!userId) {
      try {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user?.id;
      } catch (e) {
        // Ignore auth errors during logging
      }
    }
    
    // Console output for developers
    const consoleMethod = level === "ERROR" || level === "CRITICAL" ? "error" : level === "WARN" ? "warn" : "log";
    console[consoleMethod](`[${level}] ${context ? `(${context}) ` : ""}${message}`, details || "");

    try {
      // Save to Supabase for auditing/alerts
      const { error } = await supabase.from("system_logs").insert({
        level: level as any,
        message,
        details,
        context,
        user_id: userId,
      } as any);

      if (error) {
        console.error("Failed to save system log:", error);
      }
    } catch (e) {
      console.error("Error in logger saveLog:", e);
    }
  }

  async info(message: string, options?: LogOptions) {
    await this.saveLog("INFO", message, options);
  }

  async warn(message: string, options?: LogOptions) {
    await this.saveLog("WARN", message, options);
    if (!options?.silent) {
      toast.warning(message);
    }
  }

  async error(message: string, options?: LogOptions) {
    await this.saveLog("ERROR", message, options);
    if (!options?.silent) {
      toast.error(message, {
        description: "Este erro foi registrado para análise técnica.",
      });
    }
  }

  async critical(message: string, options?: LogOptions) {
    await this.saveLog("CRITICAL", message, options);
    if (!options?.silent) {
      toast.error(`CRÍTICO: ${message}`, {
        duration: 10000,
        description: "A equipe técnica foi notificada.",
      });
    }
  }
}

export const logger = new Logger();
