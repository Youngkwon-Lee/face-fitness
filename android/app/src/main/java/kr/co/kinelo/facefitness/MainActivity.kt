package kr.co.kinelo.facefitness

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import kr.co.kinelo.facefitness.ui.FaceFitnessApp
import kr.co.kinelo.facefitness.ui.HistoryStore
import kr.co.kinelo.facefitness.ui.Preferences

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        val history = HistoryStore(applicationContext)
        val preferences = Preferences(applicationContext)
        setContent { FaceFitnessApp(history, preferences) }
    }
}
