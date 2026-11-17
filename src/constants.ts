import type { BugSeverity, SupportedLanguage } from "./types";

export const LANGUAGE_CONFIG: Record<SupportedLanguage, { ext: string; starter: string }> = {
  Python: { ext: ".py", starter: "def add(a, b):\n    return a+b\n" },
  "C++": { ext: ".cpp", starter: "int add(int a, int b) {\n    return a+b;\n}\n" },
  Java: { ext: ".java", starter: "public class Main {\n    public static int add(int a, int b) {\n        return a+b;\n    }\n}\n" },
};

export const PRESETS: { id: string; label: string; language: SupportedLanguage; code: string }[] = [
  { id: "py-default", label: "Starter Snippet (Python)", language: "Python", code: LANGUAGE_CONFIG.Python.starter },
  {
    id: "py-invoice",
    label: "Invoice & Discount Engine (Python)",
    language: "Python",
    code: 'def calculate_order_total(items, discount_code, tax_rate=0.08):\n    total = 0\n    for i in range(len(items)):\n        item = items[i]\n        if item["price"] > 0:\n            total = total + item["price"] * item["qty"]\n    if discount_code == "SAVE20":\n        total = total - (total * 0.2)\n    elif discount_code == "FLAT50":\n        total = total - 50\n    if total == 0:\n        return 0\n    final_price = total + (total * tax_rate)\n    return round(final_price, 2)\n',
  },
  {
    id: "cpp-search",
    label: "Binary Search & Bounds (C++)",
    language: "C++",
    code: '#include <vector>\nusing namespace std;\n\nint binarySearch(vector<int> arr, int target) {\n    int left = 0;\n    int right = arr.size();\n    while (left <= right) {\n        int mid = (left + right) / 2;\n        if (arr[mid] == target) {\n            return mid;\n        } else if (arr[mid] < target) {\n            left = mid + 1;\n        } else {\n            right = mid - 1;\n        }\n    }\n    return -1;\n}\n',
  },
  {
    id: "java-cache",
    label: "User Session Lookup (Java)",
    language: "Java",
    code: 'import java.util.*;\n\npublic class SessionManager {\n    private Map<String, String> sessions = new HashMap<>();\n\n    public String getUserRole(String token) {\n        String user = sessions.get(token);\n        if (user.equals("admin")) {\n            return "FULL_ACCESS";\n        } else if (user.equals("editor")) {\n            return "WRITE_ACCESS";\n        }\n        return "READ_ONLY";\n    }\n\n    public void addSession(String token, String role) {\n        if (token != "" && role != null) {\n            sessions.put(token, role);\n        }\n    }\n}\n',
  },
];

export const SEVERITY_META: Record<BugSeverity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "text-red" },
  high: { label: "High", cls: "text-red" },
  medium: { label: "Medium", cls: "text-amber" },
  low: { label: "Low", cls: "text-sky" },
  info: { label: "Info", cls: "text-muted" },
};

export function scoreMeta(score: number) {
  if (score >= 8) return { label: "Healthy", cls: "text-green", bar: "bg-green", msg: "This code is in great shape with strong clarity and low defect risk." };
  if (score >= 5) return { label: "Needs Improvement", cls: "text-amber", bar: "bg-amber", msg: "Decent foundation, but addressing the flagged bugs and suggestions will improve reliability." };
  return { label: "Critical Attention", cls: "text-red", bar: "bg-red", msg: "Significant defects or structural risks were detected that should be resolved before shipping." };
}
